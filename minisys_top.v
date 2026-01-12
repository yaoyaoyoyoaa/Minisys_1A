`timescale 1ns / 1ps
// minisys_top.v - 适配 Vivado IP 核版 (inst_rom + pll)
module minisys_top(
    input  wire        board_clk,      // 板载 100MHz 时钟 (Y18)
    input  wire        board_rst,      // 板载复位 (P20)
    
    input  wire        rx,
    output wire        tx,
    
    // 数码管接口
    output wire [7:0]  digits_sel_out,
    output wire [7:0]  digits_data_out,
    
    // 拨码开关 & 按钮
    input  wire [23:0] switches_in,
    input  wire [4:0]  buttons_in,
    
    // LED 灯
    output wire [7:0]  led_RLD_out,
    output wire [7:0]  led_YLD_out,
    output wire [7:0]  led_GLD_out,
    
    // 蜂鸣器 & 矩阵键盘
    output wire        beep_out,
    input  wire [3:0]  keyboard_cols_in,
    output wire [3:0]  keyboard_rows_out
);

    // =========================================================
    // 1. 时钟管理 (调用 Clocking Wizard IP "pll")
    // =========================================================
    wire cpu_clk;
    wire locked; // 如果您在 IP 设置中取消了 locked，可忽略此信号
    
    // 实例化 pll IP
    // 注意：如果您取消了 reset 或 locked 勾选，请删除对应的端口连接行
    pll u_clocking (
        .clk_in1(board_clk),
        .clk_out1(cpu_clk), // 10MHz 输出
        .reset(1'b0),       // 如果您的 IP 有 reset 端口，请接 1'b0 或 board_rst
        .locked(locked)     // 如果您的 IP 有 locked 端口
    );

    // 复位逻辑
   // 尝试反转极性：如果板载按键是按下为0 (Active Low)，则需要取反
// 我们先只用 board_rst 测试，暂时断开 buttons_in[0] 以排除干扰
    wire sys_rst = board_rst;
    wire sys_rst_req;
    wire global_rst = sys_rst | sys_rst_req; // 高电平复位

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
    // 3. CPU 核心
    // =========================================================
    cpu_core u_cpu(
        .clk(cpu_clk),
        .rst(global_rst),
        .ext_int(ext_int),
        .imem_addr(imem_addr),
        .imem_rdata(imem_rdata),
        .dmem_addr(dmem_addr),
        .dmem_wdata(dmem_wdata),
        .dmem_we(dmem_we),
        .dmem_wstrb(dmem_wstrb),
        .dmem_rdata(dmem_rdata_cpu),
        .dbg_pc()
    );

  // =========================================================
    // 4. 指令存储器 (改为 Distributed Memory Generator IP)
    // =========================================================
    // 深度 2048 -> 地址线宽度 11位 ([10:0])
    // CPU地址 imem_addr 是字节地址，所以取 [12:2]
    inst_rom u_inst_rom (
      .a(imem_addr[12:2]),      // 输入地址 (注意端口名变成了 a)
      .spo(imem_rdata)          // 输出数据 (注意端口名变成了 spo)
    );
    // =========================================================
    // 5. 数据存储器 (分布式 RAM)
    // =========================================================
    reg [31:0] data_mem [0:16383]; // 64KB RAM
    assign ram_rdata = data_mem[dmem_addr[15:2]];

    always @(posedge cpu_clk) begin
        if (dmem_we && is_ram) begin
            if(dmem_wstrb[0]) data_mem[dmem_addr[15:2]][7:0]   <= dmem_wdata[7:0];
            if(dmem_wstrb[1]) data_mem[dmem_addr[15:2]][15:8]  <= dmem_wdata[15:8];
            if(dmem_wstrb[2]) data_mem[dmem_addr[15:2]][23:16] <= dmem_wdata[23:16];
            if(dmem_wstrb[3]) data_mem[dmem_addr[15:2]][31:24] <= dmem_wdata[31:24];
        end
    end

    // =========================================================
    // 6. MMIO 外设互联
    // =========================================================
    wire [1:0]  timer_int_vec;
    wire [23:0] led_combined;
    wire        pwm_out_dummy;
    
    mmio_if u_mmio(
        .clk(cpu_clk),
        .rst(global_rst),
        .we(dmem_we && is_mmio),
        .be(dmem_wstrb),
        .addr(dmem_addr),
        .wdata(dmem_wdata),
        .rdata(mmio_rdata),
        
        .switches(switches_in),
        .col(keyboard_cols_in),
        
        .led_out(led_combined),
        .seg_out(digits_data_out),
        .an_out(digits_sel_out),
        .row(keyboard_rows_out),
        .beep_out(beep_out),
        .pwm_out(pwm_out_dummy),
        
        .wdg_rst_req(sys_rst_req),
        .timer_int(timer_int_vec)
    );

    assign led_RLD_out = led_combined[23:16];
    assign led_YLD_out = led_combined[15:8];
    assign led_GLD_out = led_combined[7:0];

    assign tx = 1'b1;
    assign dmem_rdata_cpu = is_mmio ? mmio_rdata : ram_rdata;
    assign ext_int = {4'b0, timer_int_vec}; 

endmodule