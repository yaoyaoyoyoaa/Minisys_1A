`timescale 1ns / 1ps
// minisys_top.v - 完全移植标准版
// 2020-11 @ https://github.com/seu-cs-class2/minisys-1a-cpu
`include "public.v"

module minisys_top (
    input  wire        board_rst,      // 板上重置 (P20)
    input  wire        board_clk,      // 板上时钟 (Y18, 100MHz)

    // 拨码开关
    input  wire [23:0] switches_in,
    // 按钮
    input  wire [4:0]  buttons_in,
    // 矩阵键盘
    input  wire [3:0]  keyboard_cols_in,
    output wire [3:0]  keyboard_rows_out,
    // 数码管
    output wire [7:0]  digits_sel_out,
    output wire [7:0]  digits_data_out,
    // 蜂鸣器
    output wire        beep_out,
    // LED灯
    output wire [7:0]  led_RLD_out,
    output wire [7:0]  led_YLD_out,
    output wire [7:0]  led_GLD_out,

    input  wire        rx,             // UART接收 (Y19)
    output wire        tx              // UART发送 (V18)
);

    wire cpu_clk;
    wire uart_clk;
    wire rst;

    // 1. 串口下载启动逻辑
    // 关键：upg_rst 决定了系统是处于“等待下载”还是“正常运行”状态
    wire spg_bufg;
    BUFG U1(.I(buttons_in[3]), .O(spg_bufg)); 

    reg upg_rst;
    always @(posedge board_clk) begin
        if (spg_bufg)  upg_rst <= 0; // 按下按键3，解除锁定进入运行模式
        if (board_rst) upg_rst <= 1; // 按下复位，进入串口等待模式
    end
    
    // 系统复位信号：板载复位 OR 串口未就绪
    assign rst = board_rst | !upg_rst;

    // 2. 时钟分频 IP (Clocking Wizard)
    clocking u_clocking(
        .clk_in1(board_clk),   // 100MHz
        .cpu_clk(cpu_clk),     // 标准版通常为 5MHz
        .uart_clk(uart_clk)    // 10MHz
    );

    // 3. 内部总线与信号
    wire upg_clk_o, upg_wen_o, upg_done_o;
    wire [14:0] upg_adr_o;
    wire [31:0] upg_dat_o;

    wire [`WordRange] cpu_imem_data_in;
    wire [`WordRange] cpu_imem_addr_out;
    wire cpu_imem_e_out;

    wire [`WordRange] bus_addr, bus_write_data, bus_read_data;
    wire bus_eable, bus_we;
    wire [3:0] bus_byte_sel;

    wire [`WordRange] ram_data, seven_display_data, keyboard_data, led_light_data, switch_data, buzzer_data;

    // 4. UART 串口下载 IP (必须安装)
    uart_bmpg_0 u_uartpg(
        .upg_clk_i(uart_clk),
        .upg_rst_i(upg_rst),
        .upg_clk_o(upg_clk_o),
        .upg_wen_o(upg_wen_o),
        .upg_adr_o(upg_adr_o),
        .upg_dat_o(upg_dat_o),
        .upg_done_o(upg_done_o),
        .upg_rx_i(rx),
        .upg_tx_o(tx)
    );

    // 5. CPU 核心
    cpu u_cpu (
        .rst(rst),
        .clk(cpu_clk),
        .imem_data_in(cpu_imem_data_in),
        .imem_addr_out(cpu_imem_addr_out),
        .imem_e_out(cpu_imem_e_out),
        .bus_addr_out(bus_addr),
        .bus_write_data_out(bus_write_data),
        .bus_eable_out(bus_eable),
        .bus_we_out(bus_we),
        .bus_byte_sel_out(bus_byte_sel),
        .bus_read_in(bus_read_data),
        .interrupt_in(6'b0) // 简化处理，中断置零
    );

    // 6. 指令 ROM (带时钟反相与下载切换)
    // 关键：kickOff 逻辑确保下载完后 ROM 才归 CPU
    wire kickOff = upg_rst | (~upg_rst & upg_done_o);
    
    rom u_rom(
        .clk(~cpu_clk),            // 标准版核心秘籍：内存时钟反相
        .addr(cpu_imem_addr_out),
        .data_out(cpu_imem_data_in),
        .upg_rst(upg_rst),
        .upg_clk(upg_clk_o),
        .upg_wen(upg_wen_o & !upg_adr_o[14]),
        .upg_adr(upg_adr_o[13:0]),
        .upg_dat(upg_dat_o),
        .upg_done(upg_done_o)
    );

    // 7. 数据 RAM (支持串口改写)
    ram u_ram(
        .clk(~cpu_clk),
        .eable(bus_eable),
        .we(bus_we),
        .addr(bus_addr),
        .byte_sel(bus_byte_sel),
        .data_in(bus_write_data),
        .data_out(ram_data),
        .upg_rst(upg_rst),
        .upg_clk(upg_clk_o),
        .upg_wen(upg_wen_o & upg_adr_o[14]),
        .upg_adr(upg_adr_o[13:0]),
        .upg_dat(upg_dat_o),
        .upg_done(upg_done_o)
    );

    // 8. 仲裁与外设连接
    arbitration u_abt(
        .clk(~cpu_clk),
        .ram_data(ram_data),
        .seven_display_data(seven_display_data),
        .keyboard_data(keyboard_data),
        .counter_data(32'hFFFFFFFF),
        .pwm_data(32'hFFFFFFFF),
        .uart_data(32'hFFFFFFFF),
        .watch_dog_data(32'hFFFFFFFF),
        .led_light_data(led_light_data),
        .switch_data(switch_data),
        .buzzer_data(32'hFFFFFFFF),
        .addr(bus_addr),
        .data_out(bus_read_data)
    );

    leds u_leds(
        .rst(rst), .clk(~cpu_clk), .addr(bus_addr), .en(bus_eable),
        .byte_sel(bus_byte_sel), .data_in(bus_write_data), .we(bus_we),
        .data_out(led_light_data), .RLD(led_RLD_out), .YLD(led_YLD_out), .GLD(led_GLD_out)
    );

    switches u_switches(
        .rst(rst), .clk(~cpu_clk), .addr(bus_addr), .en(bus_eable),
        .byte_sel(bus_byte_sel), .data_in(bus_write_data), .we(bus_we),
        .data_out(switch_data), .switch_in(switches_in)
    );

    keyboard u_keyboard(
        .rst(rst), .clk(~cpu_clk), .addr(bus_addr), .en(bus_eable),
        .byte_sel(bus_byte_sel), .data_in(bus_write_data), .we(bus_we),
        .data_out(keyboard_data), .cols(keyboard_cols_in), .rows(keyboard_rows_out)
    );

    digits u_digits(
        .rst(rst), .clk(~cpu_clk), .addr(bus_addr), .en(bus_eable),
        .byte_sel(bus_byte_sel), .data_in(bus_write_data), .we(bus_we),
        .data_out(seven_display_data), .sel_out(digits_sel_out), .digital_out(digits_data_out)
    );

    beep u_beep(
        .rst(rst), .clk(~cpu_clk), .addr(bus_addr), .en(bus_eable),
        .byte_sel(bus_byte_sel), .data_in(bus_write_data), .we(bus_we),
        .data_out(buzzer_data), .signal_out(beep_out)
    );

endmodule