`timescale 1ns / 1ps
module mmio_if(
    input  wire        clk,
    input  wire        rst,
    input  wire        we,
    input  wire [3:0]  be,
    input  wire [31:0] addr,
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,

    // --- 外部硬件引脚 (连接到 minisys_top) ---
    // 1. 拨码开关 & LED
    input  wire [23:0] switches,    // 讲义1.4.1: 24位开关
    output reg  [23:0] led_out,     // 讲义1.4.1: 24位LED
    
    // 2. 8位七段数码管 (动态扫描接口)
    output reg  [7:0]  seg_out,     // 段选 (CA-DP)
    output reg  [7:0]  an_out,      // 位选 (AN7-AN0)
    
    // 3. 4x4 键盘
    input  wire [3:0]  col,
    output wire [3:0]  row,
    
    // 4. PWM & Watchdog
    output reg         pwm_out,
    output reg         wdg_rst_req, // 看门狗复位请求
    
    // 5. 中断输出
    output wire [1:0]  timer_int    // Timer0, Timer1 中断
);

    // =========================================================
    // 1. 地址映射常量 (参考讲义 4.2)
    // =========================================================
    localparam ADDR_SEG_L   = 16'hFC00; // 数码管低4位
    localparam ADDR_SEG_H   = 16'hFC02; // 数码管高4位 (16位宽)
    localparam ADDR_KEY_VAL = 16'hFC10; // 键值
    localparam ADDR_KEY_ST  = 16'hFC12; // 键盘状态
    localparam ADDR_T0_MODE = 16'hFC20; // 定时器0 方式/状态 (共用地址，读状态/写方式)
    localparam ADDR_T1_MODE = 16'hFC22; 
    localparam ADDR_T0_VAL  = 16'hFC24; // 定时器0 初值/当前值
    localparam ADDR_T1_VAL  = 16'hFC26;
    localparam ADDR_PWM_MAX = 16'hFC30;
    localparam ADDR_PWM_CMP = 16'hFC32;
    localparam ADDR_PWM_CTL = 16'hFC34;
    localparam ADDR_WDG     = 16'hFC50;
    localparam ADDR_LED     = 16'hFC60;
    localparam ADDR_SWITCH  = 16'hFC70;

    // =========================================================
    // 2. 内部寄存器定义
    // =========================================================
    // 数码管数据缓冲 (32位: 高4位+低4位)
    reg [31:0] disp_data_reg; 
    
    // 定时器寄存器
    reg [15:0] t0_mode, t1_mode; // bit0: 0=Timer, bit1: 0=One-shot/1=Repeat
    reg [15:0] t0_init, t1_init;
    reg [15:0] t0_curr, t1_curr;
    reg t0_flag, t1_flag;        // 状态位：计数到
    
    // PWM
    reg [15:0] pwm_max, pwm_cmp;
    reg pwm_en;
    reg [15:0] pwm_cnt;

    // Watchdog
    reg [31:0] wdg_cnt;
    reg wdg_en;

    // 键盘
    wire [3:0] key_val;
    wire key_pressed;
    keyboard u_kbd(.clk(clk), .rst(rst), .col(col), .row(row), .key_out(key_val), .pressed(key_pressed));

    // =========================================================
    // 3. 读写逻辑
    // =========================================================
    wire [15:0] addr_low = addr[15:0];

    // 读操作 (组合逻辑)
    always @* begin
        rdata = 32'h0;
        case (addr_low)
            ADDR_SWITCH:  rdata = {8'b0, switches}; // 24位开关
            ADDR_LED:     rdata = {8'b0, led_out};
            ADDR_KEY_VAL: rdata = {28'b0, key_val};
            ADDR_KEY_ST:  rdata = {31'b0, key_pressed};
            // 定时器读操作 (读状态或当前值)
            ADDR_T0_MODE: begin rdata = {15'b0, t0_flag}; end // 读状态寄存器
            ADDR_T1_MODE: begin rdata = {15'b0, t1_flag}; end
            ADDR_T0_VAL:  rdata = {16'b0, t0_curr};
            ADDR_T1_VAL:  rdata = {16'b0, t1_curr};
            // 数码管回读
            ADDR_SEG_L:   rdata = disp_data_reg; // 简化回读
            default:      rdata = 32'h0;
        endcase
    end

    // 写操作 (时序逻辑)
    always @(posedge clk) begin
        if (rst) begin
            led_out <= 0; disp_data_reg <= 0;
            t0_mode <= 0; t1_mode <= 0;
            t0_init <= 0; t1_init <= 0;
            pwm_max <= 16'hFFFF; pwm_cmp <= 16'h7FFF; pwm_en <= 0;
            wdg_en <= 0; wdg_rst_req <= 0;
        end else begin
            // Watchdog Reset Clear (Pulse)
            wdg_rst_req <= (wdg_cnt == 0 && wdg_en);

            // Timer Flag Auto Clear on Read? (讲义4.4: "状态寄存器在被读取后被清零")
            // 这里简化：如果被读取则清零，或者写操作清零
            // 实现：需要在读逻辑中生成 clear 信号，此处略，建议软件写1清零或自动
            if (t0_flag && addr_low == ADDR_T0_MODE && !we) t0_flag <= 0; // 读清零模拟
            if (t1_flag && addr_low == ADDR_T1_MODE && !we) t1_flag <= 0;

            if (we) begin
                case (addr_low)
                    ADDR_LED: led_out <= wdata[23:0];
                    // 数码管：支持分别写高低16位
                    ADDR_SEG_L: disp_data_reg[15:0]  <= wdata[15:0];
                    ADDR_SEG_H: disp_data_reg[31:16] <= wdata[15:0]; // 注意地址是FC02
                    // 实际上32位写FC00会同时覆盖，这里做简化兼容
                    
                    // 定时器写 (写的是方式或初值)
                    ADDR_T0_MODE: t0_mode <= wdata[15:0];
                    ADDR_T1_MODE: t1_mode <= wdata[15:0];
                    ADDR_T0_VAL:  begin t0_init <= wdata[15:0]; t0_curr <= wdata[15:0]; t0_flag <= 0; end
                    ADDR_T1_VAL:  begin t1_init <= wdata[15:0]; t1_curr <= wdata[15:0]; t1_flag <= 0; end
                    
                    // PWM
                    ADDR_PWM_MAX: pwm_max <= wdata[15:0];
                    ADDR_PWM_CMP: pwm_cmp <= wdata[15:0];
                    ADDR_PWM_CTL: pwm_en  <= wdata[0];
                    
                    // Watchdog (写任意值复位计数值)
                    ADDR_WDG: begin wdg_cnt <= 32'hFFFFFFFF; wdg_en <= 1; end
                endcase
            end
            
            // --- 定时器计数逻辑 ---
            if (t0_curr > 0) t0_curr <= t0_curr - 1;
            else if (t0_mode[1]) begin t0_curr <= t0_init; t0_flag <= 1; end // 自动重装
            else t0_flag <= 1; // 单次模式结束
            
            if (t1_curr > 0) t1_curr <= t1_curr - 1;
            else if (t1_mode[1]) begin t1_curr <= t1_init; t1_flag <= 1; end
            
            // --- PWM 逻辑 ---
            if (pwm_en) begin
                if (pwm_cnt >= pwm_max) pwm_cnt <= 0;
                else pwm_cnt <= pwm_cnt + 1;
                pwm_out <= (pwm_cnt < pwm_cmp);
            end else pwm_out <= 0;
            
            // --- Watchdog 逻辑 ---
            if (wdg_en) begin
                if (wdg_cnt > 0) wdg_cnt <= wdg_cnt - 1;
            end else wdg_cnt <= 32'h05F5E100; // 默认值
        end
    end
    
    assign timer_int = {t1_flag, t0_flag};

    // =========================================================
    // 4. 七段数码管动态扫描逻辑 (核心补充)
    // =========================================================
    reg [19:0] scan_cnt; // 扫描分频计数器
    reg [3:0]  hex_digit; // 当前扫描位的数值
    
    always @(posedge clk) scan_cnt <= scan_cnt + 1;
    
    wire [2:0] scan_sel = scan_cnt[19:17]; // 取高位用于选择当前点亮的数码管 (约 100Hz)
    
    // 7段译码函数
    function [7:0] seg_decode;
        input [3:0] val;
        case (val)
            4'h0: seg_decode = 8'b1100_0000; // 0 (共阳极: 0亮)
            4'h1: seg_decode = 8'b1111_1001; // 1
            4'h2: seg_decode = 8'b1010_0100; // 2
            4'h3: seg_decode = 8'b1011_0000; // 3
            4'h4: seg_decode = 8'b1001_1001; // 4
            4'h5: seg_decode = 8'b1001_0010; // 5
            4'h6: seg_decode = 8'b1000_0010; // 6
            4'h7: seg_decode = 8'b1111_1000; // 7
            4'h8: seg_decode = 8'b1000_0000; // 8
            4'h9: seg_decode = 8'b1001_0000; // 9
            4'hA: seg_decode = 8'b1000_1000; // A
            4'hB: seg_decode = 8'b1000_0011; // b
            4'hC: seg_decode = 8'b1100_0110; // C
            4'hD: seg_decode = 8'b1010_0001; // d
            4'hE: seg_decode = 8'b1000_0110; // E
            4'hF: seg_decode = 8'b1000_1110; // F
            default: seg_decode = 8'b1111_1111;
        endcase
    endfunction

    // 扫描控制
    always @* begin
        // 位选信号 (低电平有效)
        an_out = 8'b1111_1111;
        an_out[scan_sel] = 0; 
        
        // 数据选择
        case (scan_sel)
            3'd0: hex_digit = disp_data_reg[3:0];
            3'd1: hex_digit = disp_data_reg[7:4];
            3'd2: hex_digit = disp_data_reg[11:8];
            3'd3: hex_digit = disp_data_reg[15:12];
            3'd4: hex_digit = disp_data_reg[19:16];
            3'd5: hex_digit = disp_data_reg[23:20];
            3'd6: hex_digit = disp_data_reg[27:24];
            3'd7: hex_digit = disp_data_reg[31:28];
        endcase
        
        seg_out = seg_decode(hex_digit);
    end

endmodule