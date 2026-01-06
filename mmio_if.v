// mmio_if.v - 存储器映射 I/O 接口
// 处理 CPU 对外设地址空间 (0xFFFF0000 - 0xFFFFFFFF) 的访问

module mmio_if(
    input  wire        clk,
    input  wire        rst,
    input  wire        we,          // 写使能
    input  wire [3:0]  be,          // 字节使能 (对应 cpu_core 的 dmem_wstrb)
    input  wire [31:0] addr,        // 物理地址
    input  wire [31:0] wdata,       // 写数据
    output reg  [31:0] rdata,       // 读数据
    
    // 连接到真实的硬件外设接口
    output reg  [31:0] disp_data,   // 七段数码管数据
    input  wire [31:0] switch_data, // 拨码开关输入
    input  wire        uart_rx_ready,
    output reg         uart_tx_en,
    output wire [7:0]  uart_tx_data
);

    // 内部寄存器用于模拟串口缓存
    reg [7:0] uart_tx_reg;
    assign uart_tx_data = uart_tx_reg;

    // --- 读逻辑 ---
    always @* begin
        case (addr[15:0])
            16'h0000: rdata = {31'b0, uart_rx_ready}; // 串口状态
            16'h0004: rdata = 32'h0;                  // 串口数据 (此处简化)
            16'h0010: rdata = disp_data;              // 读取当前显示值
            16'h0014: rdata = switch_data;            // 读取拨码开关
            default:  rdata = 32'hDEADBEEF;           // 未定义地址
        endcase
    end

    // --- 写逻辑 ---
    always @(posedge clk) begin
        if (rst) begin
            disp_data   <= 32'd0;
            uart_tx_en  <= 1'b0;
            uart_tx_reg <= 8'd0;
        end else begin
            uart_tx_en <= 1'b0; // 默认不发送
            if (we) begin
                case (addr[15:0])
                    16'h0010: begin // 写数码管
                        // 支持按字节修改 (SB 指令)
                        if (be[0]) disp_data[7:0]   <= wdata[7:0];
                        if (be[1]) disp_data[15:8]  <= wdata[15:8];
                        if (be[2]) disp_data[23:16] <= wdata[23:16];
                        if (be[3]) disp_data[31:24] <= wdata[31:24];
                    end
                    16'h0004: begin // 写串口发送寄存器
                        uart_tx_reg <= wdata[7:0];
                        uart_tx_en  <= 1'b1;
                    end
                endcase
            end
        end
    end

endmodule