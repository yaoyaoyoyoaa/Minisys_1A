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
    output reg         pwm_out,
    
    // 键盘接口
    input  wire [3:0]  col, 
    output wire [3:0]  row,

    // 系统接口
    output wire        sys_rst_req, // 看门狗复位请求
    output wire [1:0]  timer_int    // 改为2位，支持两个定时器
);

    // 寄存器定义
    reg [15:0] led_reg; assign led_out = led_reg;
    reg [7:0]  uart_tx_reg; assign uart_tx_data = uart_tx_reg;
    reg [7:0]  pwm_duty; reg [7:0] pwm_cnt;
    
    // Timer 1
    reg [1:0]  timer1_ctrl; reg [15:0] timer1_load; reg [15:0] timer1_count;
    reg        timer1_irq;
    // Timer 2 (新增)
    reg [1:0]  timer2_ctrl; reg [15:0] timer2_load; reg [15:0] timer2_count;
    reg        timer2_irq;

    // Watchdog (新增)
    reg        wdg_en;      // 启用
    reg [31:0] wdg_count;   // 计数器
    reg        wdg_feed;    // 喂狗位
    reg        wdg_bark;    // 复位信号
    
    assign sys_rst_req = wdg_bark;
    assign timer_int = {timer2_irq, timer1_irq};

    // 键盘逻辑
    wire [3:0] kbd_val;
    wire       kbd_pressed;
    keyboard u_kbd(.clk(clk), .rst(rst), .col(col), .row(row), .key_out(kbd_val), .pressed(kbd_pressed));

    // Timer 1 Logic
    always @(posedge clk) begin
        if (rst) begin timer1_count <= 0; timer1_irq <= 0; end 
        else if (timer1_ctrl[0]) begin
            if (timer1_count == 0) begin
                timer1_count <= timer1_load;
                if (timer1_ctrl[1]) timer1_irq <= 1; 
            end else begin
                timer1_count <= timer1_count - 1;
                timer1_irq <= 0;
            end
        end
    end

    // Timer 2 Logic (New)
    always @(posedge clk) begin
        if (rst) begin timer2_count <= 0; timer2_irq <= 0; end 
        else if (timer2_ctrl[0]) begin
            if (timer2_count == 0) begin
                timer2_count <= timer2_load;
                if (timer2_ctrl[1]) timer2_irq <= 1; 
            end else begin
                timer2_count <= timer2_count - 1;
                timer2_irq <= 0;
            end
        end
    end

    // Watchdog Logic (New)
    // 假设时钟100MHz，32位计数器如果不喂狗，约40秒溢出(视具体需求调整)
    always @(posedge clk) begin
        if (rst) begin
            wdg_en <= 0; wdg_count <= 32'hFFFFFFFF; wdg_bark <= 0;
        end else begin
            if (wdg_feed) begin
                wdg_count <= 32'hFFFFFFFF; // 喂狗重置
            end else if (wdg_en) begin
                if (wdg_count == 0) wdg_bark <= 1; // 咬人(复位)
                else wdg_count <= wdg_count - 1;
            end
        end
    end

    // PWM Logic
    always @(posedge clk) begin
        if (rst) begin pwm_cnt <= 0; pwm_out <= 0; end
        else begin pwm_cnt <= pwm_cnt + 1; pwm_out <= (pwm_cnt < pwm_duty); end
    end

    // Read Logic
    always @* begin
        case (addr[15:0])
            16'h0000: rdata = {31'b0, uart_rx_ready};
            16'h0010: rdata = disp_data;
            16'h0014: rdata = switch_data;
            16'h0020: rdata = {16'b0, led_reg};
            16'h0040: rdata = {24'b0, pwm_duty};
            // Keyboard
            16'hFC10: rdata = {28'b0, kbd_val};
            16'hFC12: rdata = {31'b0, kbd_pressed};
            // Timer 1
            16'h0030: rdata = {30'b0, timer1_ctrl};
            16'h0034: rdata = {16'b0, timer1_count};
            // Timer 2
            16'h0038: rdata = {30'b0, timer2_ctrl};
            16'h003C: rdata = {16'b0, timer2_count};
            // Watchdog (0x0050)
            16'h0050: rdata = {31'b0, wdg_en};
            
            default:  rdata = 32'h0;
        endcase
    end

    // Write Logic
    always @(posedge clk) begin
        wdg_feed <= 0; // 自自动复位喂狗信号
        if (rst) begin
            disp_data <= 0; led_reg <= 0; uart_tx_en <= 0;
            timer1_ctrl <= 0; timer1_load <= 0; pwm_duty <= 0;
            timer2_ctrl <= 0; timer2_load <= 0;
        end else begin
            uart_tx_en <= 0;
            if (we) begin
                case (addr[15:0])
                    // ... (原有 LED/Disp/Uart 写逻辑保持不变) ...
                    16'h0010: begin // Disp
                        if(be[0]) disp_data[7:0] <= wdata[7:0];
                        if(be[1]) disp_data[15:8] <= wdata[15:8];
                        if(be[2]) disp_data[23:16]<= wdata[23:16];
                        if(be[3]) disp_data[31:24]<= wdata[31:24];
                    end
                    16'h0020: if(be[0]) led_reg[7:0] <= wdata[7:0]; // LED
                    16'h0040: pwm_duty <= wdata[7:0];
                    
                    // Timer 1
                    16'h0030: timer1_ctrl <= wdata[1:0];
                    16'h0034: timer1_load <= wdata[15:0];
                    // Timer 2
                    16'h0038: timer2_ctrl <= wdata[1:0];
                    16'h003C: timer2_load <= wdata[15:0];
                    
                    // Watchdog
                    16'h0050: begin
                        wdg_en <= wdata[0];
                        if (wdata[1]) wdg_feed <= 1; // 写 bit1 喂狗
                    end
                endcase
            end
        end
    end
endmodule