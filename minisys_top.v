`timescale 1ns / 1ps
// minisys_top.v - 适配标准 Minisys-1A 开发板
module minisys_top(
    input  wire        board_clk,      // 板载 100MHz 时钟 (Y18)
    input  wire        board_rst,      // 板载复位 (P20)
    
    // 串口 (透传或暂不使用)
    input  wire        rx,
    output wire        tx,
    
    // 数码管接口
    output wire [7:0]  digits_sel_out, // 位选
    output wire [7:0]  digits_data_out,// 段选
    
    // 拨码开关 & 按钮
    input  wire [23:0] switches_in,
    input  wire [4:0]  buttons_in,     // [新增] 避免 XDC 报错，可作为额外复位或输入
    
    // LED 灯 (拆分为三组)
    output wire [7:0]  led_RLD_out,    // 红灯
    output wire [7:0]  led_YLD_out,    // 黄灯
    output wire [7:0]  led_GLD_out,    // 绿灯
    
    // 蜂鸣器 & 矩阵键盘
    output wire        beep_out,
    input  wire [3:0]  keyboard_cols_in,
    output wire [3:0]  keyboard_rows_out
);

    // =========================================================
    // 1. 时钟管理 (使用提供的 clocking IP)
    // =========================================================
    wire cpu_clk;   // 10MHz
    wire uart_clk;  // 10MHz (暂未通过 UART 下载程序，预留)
    wire locked;
    
    clocking u_clocking (
        .clk_in1 (board_clk),
        .cpu_clk (cpu_clk),
        .uart_clk(uart_clk)
    );

    // 复位逻辑：板载复位键 OR 按钮[0] (增加调试灵活性)
    wire sys_rst = board_rst | buttons_in[0];
    wire sys_rst_req; // 软件复位请求 (Watchdog)
    wire global_rst = sys_rst | sys_rst_req;

    // =========================================================
    // 2. 内部信号定义
    // =========================================================
    wire [31:0] imem_addr;
    wire [31:0] imem_rdata;
    
    wire [31:0] dmem_addr;
    wire [31:0] dmem_wdata;
    wire [31:0] dmem_rdata_cpu;
    wire        dmem_we;
    wire [3:0]  dmem_wstrb;
    wire [5:0]  ext_int;
    
    wire [31:0] ram_rdata;
    wire [31:0] mmio_rdata;
    
    // 地址空间解码
    wire is_mmio = (dmem_addr[31:16] == 16'hFFFF);
    wire is_ram  = (dmem_addr[31:16] == 16'h0000);

    // =========================================================
    // 3. CPU 核心 (使用降频后的 cpu_clk)
    // =========================================================
    cpu_core u_cpu(
        .clk(cpu_clk),          // <--- 关键修改：使用 10MHz 时钟
        .rst(global_rst),
        .ext_int(ext_int),
        .imem_addr(imem_addr),
        .imem_rdata(imem_rdata),
        .dmem_addr(dmem_addr),
        .dmem_wdata(dmem_wdata),
        .dmem_we(dmem_we),
        .dmem_wstrb(dmem_wstrb),
        .dmem_rdata(dmem_rdata_cpu),
        .dbg_pc()               // 悬空调试端口
    );

    // =========================================================
    // 4. 存储器 (分布式 RAM, 读取 program.txt)
    // =========================================================
    (* rom_style = "distributed" *)
    reg [31:0] inst_mem [0:2047];

    initial begin
        $readmemh("program.txt", inst_mem);
    end
    assign imem_rdata = inst_mem[imem_addr[12:2]];

    reg [31:0] data_mem [0:16383];
    assign ram_rdata = data_mem[dmem_addr[15:2]];

    always @(posedge cpu_clk) begin // 使用 cpu_clk
        if (dmem_we && is_ram) begin
            if(dmem_wstrb[0]) data_mem[dmem_addr[15:2]][7:0]   <= dmem_wdata[7:0];
            if(dmem_wstrb[1]) data_mem[dmem_addr[15:2]][15:8]  <= dmem_wdata[15:8];
            if(dmem_wstrb[2]) data_mem[dmem_addr[15:2]][23:16] <= dmem_wdata[23:16];
            if(dmem_wstrb[3]) data_mem[dmem_addr[15:2]][31:24] <= dmem_wdata[31:24];
        end
    end

    // =========================================================
    // 5. MMIO 外设互联
    // =========================================================
    wire [1:0]  timer_int_vec;
    wire [23:0] led_combined; // 内部合并的 LED 信号
    wire        pwm_out_dummy; // 也就是 XDC 里没有 PWM 引脚，我们悬空处理
    
    mmio_if u_mmio(
        .clk(cpu_clk),          // 使用 cpu_clk
        .rst(global_rst),
        .we(dmem_we && is_mmio),
        .be(dmem_wstrb),
        .addr(dmem_addr),
        .wdata(dmem_wdata),
        .rdata(mmio_rdata),
        
        // 输入设备
        .switches(switches_in), // 连接拨码开关
        .col(keyboard_cols_in), // 连接键盘列
        
        // 输出设备
        .led_out(led_combined), // 24位 LED 输出
        .seg_out(digits_data_out), // 数码管段选
        .an_out(digits_sel_out),   // 数码管位选
        .row(keyboard_rows_out),   // 键盘行
        .beep_out(beep_out),       // 蜂鸣器
        .pwm_out(pwm_out_dummy),   // PWM (无引脚)
        
        // 系统信号
        .wdg_rst_req(sys_rst_req),
        .timer_int(timer_int_vec)
    );

    // 将 24位 LED 拆分到板上的三组 LED
    // 假设映射关系：高8位->红, 中8位->黄, 低8位->绿
    assign led_RLD_out = led_combined[23:16];
    assign led_YLD_out = led_combined[15:8];
    assign led_GLD_out = led_combined[7:0];

    // 其他信号处理
    assign tx = 1'b1; // 串口发送空闲
    assign dmem_rdata_cpu = is_mmio ? mmio_rdata : ram_rdata;
    
    // 中断连接 (如需测试中断程序，可连接 timer_int_vec)
    assign ext_int = {4'b0, timer_int_vec}; 

endmodule