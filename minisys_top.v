`timescale 1ns / 1ps
// minisys_top.v - MiniSys-1A SoC 顶层模块 (Updated for Step 5 Requirements)
module minisys_top(
    input  wire        clk,          // 系统时钟 (如 100MHz)
    input  wire        rst,          // 开发板复位按键 (高有效)
    
    // --- 外部硬件接口 (连接到开发板引脚) ---
    input  wire        uart_rx,      // 串口接收
    output wire        uart_tx,      // 串口发送
    output wire [31:0] seven_seg,    // 8位七段数码管 (映射到 0xFFFF0010)
    input  wire [31:0] switches,     // 拨码开关 (映射到 0xFFFF0014)
    output wire [15:0] leds,         // 16位 LED (映射到 0xFFFF0020)
    output wire        pwm_out,      // PWM 输出 (映射到 0xFFFF0040)
    
    // [新增] 4x4 矩阵键盘接口
    input  wire [3:0]  col,          // 键盘列输入 (映射到 0xFFFFFC1x)
    output wire [3:0]  row           // 键盘行扫描输出
);

    // =========================================================================
    // 1. 信号定义与复位逻辑
    // =========================================================================
    
    // [新增] 系统复位逻辑
    // 真正的系统复位 = 外部按键复位 OR 看门狗复位请求
    wire sys_rst_req;       // 来自 MMIO 看门狗的复位请求
    wire sys_rst = rst | sys_rst_req;

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
        .rst(sys_rst),          // [修改] 使用合并后的系统复位
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
    // 容量: 64KB (16384 x 32bit)
    reg [31:0] inst_mem [0:16383];
    
    initial begin
        // 在 Vivado 综合时，建议使用 $readmemh 加载初始化文件
        // $readmemh("program.txt", inst_mem);
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
    
    // [新增] 定义多位定时器中断向量 (Timer1 + Timer2)
    wire [1:0] timer_int_vec;

    mmio_if u_mmio(
        .clk(clk),
        .rst(sys_rst),           // [修改] 使用合并后的系统复位
        .we(dmem_we && is_mmio), // 只有地址匹配时才写
        .be(dmem_wstrb),
        .addr(dmem_addr),
        .wdata(dmem_wdata),
        .rdata(mmio_rdata),
        
        // 外部引脚
        .uart_rx_ready(1'b0), // 简化处理
        .uart_tx_en(),
        .uart_tx_data(uart_tx_data_w), // 如果需要连接 tx 引脚，需增加 uart 发送模块，此处仅保留接口
        .disp_data(seven_seg),
        .switch_data(switches),
        .led_out(leds),       
        .pwm_out(pwm_out),
        
        // [新增] 键盘与高级系统接口
        .col(col),               // 连接到顶层键盘输入
        .row(row),               // 连接到顶层键盘扫描输出
        .sys_rst_req(sys_rst_req), // 接收看门狗复位请求
        .timer_int(timer_int_vec)  // 接收双定时器中断 [1:0]
    );

    // 简单的 UART TX 占位 (如果有 UART 发送模块需在此实例化)
    wire [7:0] uart_tx_data_w;
    assign uart_tx = 1'b1; // 默认拉高 (空闲)

    // =========================================================================
    // 5. 总线多路选择 (Mux) 与 中断连接
    // =========================================================================
    
    // 数据回读选择: 如果地址是 0xFFFFxxxx 则读 MMIO，否则读 RAM
    assign dmem_rdata_cpu = is_mmio ? mmio_rdata : ram_rdata;

    // 中断连接更新: 
    // 将 2位 定时器中断连接到 CPU 的 ext_int[1:0]
    // ext_int[0] = Timer1, ext_int[1] = Timer2
    assign ext_int = {4'b0, timer_int_vec};

endmodule