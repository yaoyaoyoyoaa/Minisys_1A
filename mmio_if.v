`timescale 1ns / 1ps
module mmio_if(
    input  wire        clk,
    input  wire        rst,
    input  wire        we,
    input  wire [3:0]  be,
    input  wire [31:0] addr,  
    input  wire [31:0] wdata,
    output reg  [31:0] rdata,
    
    // --- 外部接口 ---
    input  wire        uart_rx_ready,
    output reg         uart_tx_en,
    output wire [7:0]  uart_tx_data,

    output reg  [31:0] disp_data,
    input  wire [31:0] switch_data,
    output wire [15:0] led_out,

    output reg         timer_int,
    output reg         pwm_out,
    
    // [新增] 键盘接口
    input  wire [3:0]  col, // 键盘列 (Input)
    output wire [3:0]  row  // 键盘行 (Output)
);

    // 寄存器定义
    reg [15:0] led_reg; assign led_out = led_reg;
    reg [7:0] uart_tx_reg; assign uart_tx_data = uart_tx_reg;
    reg [1:0] timer_ctrl; reg [15:0] timer_load; reg [15:0] timer_count;
    reg [7:0] pwm_duty; reg [7:0] pwm_cnt;

    // 键盘信号
    wire [3:0] kbd_val;
    wire       kbd_pressed;

    // 实例化键盘
    keyboard u_kbd(
        .clk(clk),
        .rst(rst),
        .col(col),
        .row(row),
        .key_out(kbd_val),
        .pressed(kbd_pressed)
    );

    // Timer 逻辑
    always @(posedge clk) begin
        if (rst) begin
            timer_count <= 0; timer_int <= 0;
        end else if (timer_ctrl[0]) begin
            if (timer_count == 0) begin
                timer_count <= timer_load;
                if (timer_ctrl[1]) timer_int <= 1; else timer_int <= 0;
            end else begin
                timer_count <= timer_count - 1; timer_int <= 0;
            end
        end
    end
    
    // PWM 逻辑
    always @(posedge clk) begin
        if (rst) begin pwm_cnt <= 0; pwm_out <= 0; end
        else begin pwm_cnt <= pwm_cnt + 1; pwm_out <= (pwm_cnt < pwm_duty); end
    end

    // --- 读逻辑 (Read) ---
    always @* begin
        case (addr[15:0])
            16'h0000: rdata = {31'b0, uart_rx_ready};
            16'h0010: rdata = disp_data;
            16'h0014: rdata = switch_data;
            16'h0020: rdata = {16'b0, led_reg};
            
            // [新增] 键盘键值 (低4位)
            16'hFC10: rdata = {28'b0, kbd_val}; 
            
            // [新增] 键盘状态 (第0位: 1=按下)
            16'hFC12: rdata = {31'b0, kbd_pressed};

            // Timer
            16'h0030: rdata = {30'b0, timer_ctrl};
            16'h0034: rdata = {16'b0, timer_count};
            16'h0040: rdata = {24'b0, pwm_duty};
            
            default:  rdata = 32'h0;
        endcase
    end

    // --- 写逻辑 (Write) ---
    always @(posedge clk) begin
        if (rst) begin
            disp_data <= 0; led_reg <= 0; uart_tx_en <= 0;
            timer_ctrl <= 0; timer_load <= 0; pwm_duty <= 0;
        end else begin
            uart_tx_en <= 0;
            if (we) begin
                case (addr[15:0])
                    16'h0010: begin // 数码管
                        if(be[0]) disp_data[7:0] <= wdata[7:0];
                        if(be[1]) disp_data[15:8] <= wdata[15:8];
                        if(be[2]) disp_data[23:16]<= wdata[23:16];
                        if(be[3]) disp_data[31:24]<= wdata[31:24];
                    end
                    16'h0020: begin // LED
                         if(be[0]) led_reg[7:0] <= wdata[7:0];
                         if(be[1]) led_reg[15:8] <= wdata[15:8];
                    end
                    16'h0004: begin uart_tx_reg <= wdata[7:0]; uart_tx_en <= 1; end
                    16'h0030: timer_ctrl <= wdata[1:0];
                    16'h0034: timer_load <= wdata[15:0];
                    16'h0040: pwm_duty <= wdata[7:0];
                endcase
            end
        end
    end
endmodule