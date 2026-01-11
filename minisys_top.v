`timescale 1ns / 1ps
// minisys_top.v - 最终完美版 (支持读文件 + 分布式RAM)
module minisys_top(
    input  wire        clk,
    input  wire        rst,
    input  wire        uart_rx,
    output wire        uart_tx,
    output wire [7:0]  seg_out, 
    output wire [7:0]  an_out,
    input  wire [23:0] switches,
    output wire [23:0] leds,
    output wire        pwm_out,
    input  wire [3:0]  col,
    output wire [3:0]  row
);

    // 1. 信号定义
    wire [31:0] debug_pc; 
    wire sys_rst_req;
    wire sys_rst = rst | sys_rst_req;

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
    
    wire is_mmio = (dmem_addr[31:16] == 16'hFFFF);
    wire is_ram  = (dmem_addr[31:16] == 16'h0000);

    // 2. CPU 核心
    cpu_core u_cpu(
        .clk(clk),
        .rst(sys_rst),
        .ext_int(ext_int),
        .imem_addr(imem_addr),
        .imem_rdata(imem_rdata),
        .dmem_addr(dmem_addr),
        .dmem_wdata(dmem_wdata),
        .dmem_we(dmem_we),
        .dmem_wstrb(dmem_wstrb),
        .dmem_rdata(dmem_rdata_cpu),
        .dbg_pc(debug_pc) 
    );

    // =========================================================
    // 3. 存储器 (最终方案：读文件 + 必胜配置)
    // =========================================================
    
    // 【必胜法宝】强制使用分布式 RAM (Distributed RAM)
    // 这会强制 Vivado 用 LUT 搭建内存，初始化文件绝对能读进去！
    (* rom_style = "distributed" *)
    reg [31:0] inst_mem [0:2047]; // 8KB 容量，足够放计算器

    initial begin
        // 使用文件名读取 (文件请放在工程目录下，或使用绝对路径)
        $readmemh("program.txt", inst_mem);
    end

    // 正常的读内存逻辑
    assign imem_rdata = inst_mem[imem_addr[12:2]]; // 地址匹配 [0:2047]

    // --- 数据存储器 (RAM) ---
    reg [31:0] data_mem [0:16383];
    assign ram_rdata = data_mem[dmem_addr[15:2]];

    always @(posedge clk) begin
        if (dmem_we && is_ram) begin
            if(dmem_wstrb[0]) data_mem[dmem_addr[15:2]][7:0]   <= dmem_wdata[7:0];
            if(dmem_wstrb[1]) data_mem[dmem_addr[15:2]][15:8]  <= dmem_wdata[15:8];
            if(dmem_wstrb[2]) data_mem[dmem_addr[15:2]][23:16] <= dmem_wdata[23:16];
            if(dmem_wstrb[3]) data_mem[dmem_addr[15:2]][31:24] <= dmem_wdata[31:24];
        end
    end

    // 4. MMIO 外设
    wire [1:0] timer_int_vec;
    mmio_if u_mmio(
        .clk(clk),
        .rst(sys_rst),
        .we(dmem_we && is_mmio),
        .be(dmem_wstrb),
        .addr(dmem_addr),
        .wdata(dmem_wdata),
        .rdata(mmio_rdata),
        .switches(switches),
        // .led_out(leds), // LED 断开，留给调试用
        .seg_out(seg_out), 
        .an_out(an_out),
        .col(col),
        .row(row),
        .pwm_out(pwm_out),
        .wdg_rst_req(sys_rst_req),
        .timer_int(timer_int_vec)
    );

    assign uart_tx = 1'b1;
    assign dmem_rdata_cpu = is_mmio ? mmio_rdata : ram_rdata;
    
    // 依然屏蔽中断，防止你的计算器程序被 Timer0 打断
    assign ext_int = 6'b0; 

   // 5. LED 状态指示
    assign leds[23] = sys_rst;
    assign leds[22:4] = 0; 
    
    // 【调试核心】将键盘列线 (col) 直接连到 LED[3:0]
    // 正常情况（上拉生效）：不按键时，col 全为 1，LED[3:0] 应该全亮！
    // 异常情况（上拉失败）：不按键时，col 悬空为 0，LED[3:0] 全灭！
    assign leds[3:0] = col; 
    
    // assign leds[15:0] = debug_pc[17:2]; // 先注释掉 PC 监控
endmodule