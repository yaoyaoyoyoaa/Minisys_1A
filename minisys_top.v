`timescale 1ns / 1ps
// minisys_top.v - MiniSys-1A SoC 顶层模块
module minisys_top(
    input  wire        clk,          // 系统时钟 (如 100MHz)
    input  wire        rst,          // 系统复位 (高有效)
    
    // --- 外部硬件接口 (连接到开发板引脚) ---
    input  wire        uart_rx,      // 串口接收
    output wire        uart_tx,      // 串口发送
    output wire [31:0] seven_seg,    // 8位七段数码管 (映射到 0xFFFF0010)
    input  wire [31:0] switches,     // 拨码开关 (映射到 0xFFFF0014)
    output wire [15:0] leds,         // 16位 LED (映射到 0xFFFF0020)
    output wire        pwm_out       // PWM 输出 (映射到 0xFFFF0040)
);

    // =========================================================================
    // 1. 信号定义
    // =========================================================================
    
    // CPU 接口信号
    wire [31:0] imem_addr;
    wire [31:0] imem_rdata;
    
    wire [31:0] dmem_addr;
    wire [31:0] dmem_wdata;
    wire [31:0] dmem_rdata_cpu; // CPU 读到的最终数据
    wire        dmem_we;
    wire [3:0]  dmem_wstrb;
    wire [5:0]  ext_int;        // 外部中断信号
    
    // 内存与外设读数据
    wire [31:0] ram_rdata;
    wire [31:0] mmio_rdata;
    
    // 地址解码信号
    wire is_mmio = (dmem_addr[31:16] == 16'hFFFF); // 地址 0xFFFFxxxx 访问外设
    wire is_ram  = (dmem_addr[31:16] == 16'h0000); // 地址 0x0000xxxx 访问 RAM

    // =========================================================================
    // 2. CPU 核心实例化
    // =========================================================================
    cpu_core u_cpu(
        .clk(clk),
        .rst(rst),
        .ext_int(ext_int),      // 中断输入
        
        // 指令存储器
        .imem_addr(imem_addr),
        .imem_rdata(imem_rdata),
        
        // 数据存储器 & IO
        .dmem_addr(dmem_addr),
        .dmem_wdata(dmem_wdata),
        .dmem_we(dmem_we),
        .dmem_wstrb(dmem_wstrb),
        .dmem_rdata(dmem_rdata_cpu), // 回传选通后的数据
        
        .dbg_pc() // 调试端口悬空
    );

    // =========================================================================
    // 3. 存储器实例化 (哈佛结构)
    // =========================================================================
    
    // --- 指令存储器 (ROM) ---
    // 实际工程中请使用 Block RAM IP 核，这里用 Behavioral 模拟
    // 容量: 64KB (16384 x 32bit)
    reg [31:0] inst_mem [0:16383]; 
    
    // 简单的初始化 (实际使用 $readmemh)
    initial begin
        // $readmemh("program.txt", inst_mem); 
        // 你的 core.js 生成的机器码文件应加载到这里
    end
    
    // 读指令 (字对齐)
    assign imem_rdata = inst_mem[imem_addr[15:2]];

    // --- 数据存储器 (RAM) ---
    // 容量: 64KB (16384 x 32bit)
    reg [31:0] data_mem [0:16383];
    
    // RAM 读逻辑
    assign ram_rdata = data_mem[dmem_addr[15:2]];
    
    // RAM 写逻辑 (支持字节写)
    always @(posedge clk) begin
        if (dmem_we && is_ram) begin
            if(dmem_wstrb[0]) data_mem[dmem_addr[15:2]][7:0]   <= dmem_wdata[7:0];
            if(dmem_wstrb[1]) data_mem[dmem_addr[15:2]][15:8]  <= dmem_wdata[15:8];
            if(dmem_wstrb[2]) data_mem[dmem_addr[15:2]][23:16] <= dmem_wdata[23:16];
            if(dmem_wstrb[3]) data_mem[dmem_addr[15:2]][31:24] <= dmem_wdata[31:24];
        end
    end

    // =========================================================================
    // 4. MMIO 外设接口实例化
    // =========================================================================
    wire timer_int_signal; // 定时器产生的中断

    mmio_if u_mmio(
        .clk(clk),
        .rst(rst),
        .we(dmem_we && is_mmio), // 只有地址匹配时才写
        .be(dmem_wstrb),
        .addr(dmem_addr),
        .wdata(dmem_wdata),
        .rdata(mmio_rdata),
        
        // 外部引脚
        .uart_rx_ready(1'b0), // 简化
        .uart_tx_en(),
        .uart_tx_data(),
        .disp_data(seven_seg),
        .switch_data(switches),
        .led_out(leds),       // Step 2 增加的端口
        
        // 高级功能
        .timer_int(timer_int_signal), // 接收定时器中断
        .pwm_out(pwm_out)
    );

    // =========================================================================
    // 5. 总线多路选择 (Mux) 与 中断连接
    // =========================================================================
    
    // 数据回读选择: 如果地址是 0xFFFFxxxx 则读 MMIO，否则读 RAM
    assign dmem_rdata_cpu = is_mmio ? mmio_rdata : ram_rdata;

    // 中断连接: 将定时器中断连接到 CPU 的 ext_int[0]
    // 其他位暂接地
    assign ext_int = {5'b0, timer_int_signal};

endmodule