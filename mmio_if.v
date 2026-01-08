`timescale 1ns / 1ps
// mmio_if.v - 存储器映射 I/O 接口 (增强版)
// 处理 CPU 对外设地址空间 (0xFFFF0000 - 0xFFFFFFFF) 的访问

module mmio_if(
    input  wire        clk,
    input  wire        rst,
    input  wire        we,          // 写使能
    input  wire [3:0]  be,          // 字节使能
    input  wire [31:0] addr,        // 物理地址
    input  wire [31:0] wdata,       // 写数据
    output reg  [31:0] rdata,       // 读数据
    
    // --- 外部硬件接口 ---
    
    // 1. 串口 (UART)
    input  wire        uart_rx_ready,
    output reg         uart_tx_en,
    output wire [7:0]  uart_tx_data,

    // 2. 人机交互 (GPIO)
    output reg  [31:0] disp_data,   // 七段数码管 (32位/8个)
    input  wire [31:0] switch_data, // 拨码开关 (16位有效)
    output wire [15:0] led_out,     // [新增] 16位 LED

    // 3. 定时器与控制
    output reg         timer_int,   // [新增] 定时器中断 -> 连到 CPU ext_int
    output reg         pwm_out      // [新增] PWM 输出 -> 连到 LED或蜂鸣器
);

    // =========================================================================
    // 1. 内部寄存器定义
    // =========================================================================
    
    // UART
    reg [7:0] uart_tx_reg;
    assign uart_tx_data = uart_tx_reg;

    // LED
    reg [15:0] led_reg;
    assign led_out = led_reg;

    // Timer (16位)
    reg [1:0]  timer_ctrl;  // bit0: Enable, bit1: Int Enable
    reg [15:0] timer_load;  // 重装载值
    reg [15:0] timer_count; // 当前计数值

    // PWM (8位分辨率示例)
    reg [7:0] pwm_duty;     // 占空比
    reg [7:0] pwm_cnt;      // 内部计数器

    // =========================================================================
    // 2. 硬件逻辑实现
    // =========================================================================

    // --- 定时器逻辑 ---
    // 简单的减法计数器，减到0产生中断脉冲并重装载
    always @(posedge clk) begin
        if (rst) begin
            timer_count <= 0;
            timer_int   <= 0;
        end else if (timer_ctrl[0]) begin // 如果定时器使能
            if (timer_count == 0) begin
                timer_count <= timer_load;      // 重装载
                if (timer_ctrl[1]) timer_int <= 1'b1; // 触发中断
                else               timer_int <= 1'b0;
            end else begin
                timer_count <= timer_count - 1; // 计数
                timer_int   <= 1'b0;            // 中断是脉冲信号
            end
        end else begin
            timer_int <= 1'b0;
        end
    end

    // --- PWM 逻辑 ---
    // 简单的比较逻辑：计数器 < 占空比 ? 高电平 : 低电平
    always @(posedge clk) begin
        if (rst) begin
            pwm_cnt <= 0;
            pwm_out <= 0;
        end else begin
            pwm_cnt <= pwm_cnt + 1;
            pwm_out <= (pwm_cnt < pwm_duty);
        end
    end

    // =========================================================================
    // 3. 总线读逻辑 (Read)
    // =========================================================================
    always @* begin
        case (addr[15:0])
            // UART
            16'h0000: rdata = {31'b0, uart_rx_ready}; // 串口状态
            16'h0004: rdata = 32'h0;                  // 串口数据 (简化)
            
            // GPIO
            16'h0010: rdata = disp_data;              // 数码管值
            16'h0014: rdata = switch_data;            // 拨码开关值
            16'h0020: rdata = {16'b0, led_reg};       // [新增] LED值

            // Timer
            16'h0030: rdata = {30'b0, timer_ctrl};    // [新增] 定时器控制
            16'h0034: rdata = {16'b0, timer_count};   // [新增] 定时器当前值

            // PWM
            16'h0040: rdata = {24'b0, pwm_duty};      // [新增] PWM占空比

            default:  rdata = 32'h0;
        endcase
    end

    // =========================================================================
    // 4. 总线写逻辑 (Write)
    // =========================================================================
    always @(posedge clk) begin
        if (rst) begin
            disp_data   <= 32'd0;
            led_reg     <= 16'd0;
            uart_tx_en  <= 1'b0;
            uart_tx_reg <= 8'd0;
            timer_ctrl  <= 2'b0;
            timer_load  <= 16'd0;
            pwm_duty    <= 8'd0;
        end else begin
            uart_tx_en <= 1'b0; // 默认拉低发送使能（脉冲）

            if (we) begin
                case (addr[15:0])
                    // --- 数码管 (0xFFFF0010) ---
                    // 支持 SB/SH 指令部分写入
                    16'h0010: begin 
                        if (be[0]) disp_data[7:0]   <= wdata[7:0];
                        if (be[1]) disp_data[15:8]  <= wdata[15:8];
                        if (be[2]) disp_data[23:16] <= wdata[23:16];
                        if (be[3]) disp_data[31:24] <= wdata[31:24];
                    end

                    // --- 拨码开关 (0xFFFF0014) ---
                    // 只读，不可写

                    // --- LED (0xFFFF0020) [新增] ---
                    16'h0020: begin
                        if (be[0]) led_reg[7:0]  <= wdata[7:0];
                        if (be[1]) led_reg[15:8] <= wdata[15:8];
                    end

                    // --- UART 发送 (0xFFFF0004) ---
                    16'h0004: begin 
                        uart_tx_reg <= wdata[7:0];
                        uart_tx_en  <= 1'b1; // 产生一个周期的高脉冲
                    end

                    // --- Timer 控制 (0xFFFF0030) [新增] ---
                    16'h0030: timer_ctrl <= wdata[1:0];

                    // --- Timer 初值 (0xFFFF0034) [新增] ---
                    16'h0034: begin
                        timer_load <= wdata[15:0];
                        // 写入初值时，可选择是否立即刷新计数器(这里简化为立即刷新)
                        // timer_count <= wdata[15:0]; 
                    end

                    // --- PWM 占空比 (0xFFFF0040) [新增] ---
                    16'h0040: pwm_duty <= wdata[7:0];

                endcase
            end
        end
    end

endmodule