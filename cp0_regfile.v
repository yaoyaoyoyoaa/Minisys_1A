// cp0_regfile.v - 协处理器0，处理中断控制
module cp0_regfile(
    input  wire        clk,
    input  wire        rst,
    input  wire        we,         // 来自 mtc0 指令
    input  wire [4:0]  addr,       // 寄存器编号
    input  wire [31:0] din,        // 写入数据
    input  wire [5:0]  ext_int,    // 外部中断位
    input  wire        exception_i,// 异常触发标志
    input  wire [31:0] epc_i,      // 触发异常时的PC
    output reg  [31:0] data_o,     // 读出数据 (mfc0)
    output wire [31:0] epc_o       // 输出给 PC 的返回地址
);
    // 定义核心寄存器
    reg [31:0] status; // 寄存器12: 中断屏蔽与使能
    reg [31:0] cause;  // 寄存器13: 异常原因
    reg [31:0] epc;    // 寄存器14: 异常返回地址

    assign epc_o = epc;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            status <= 32'h00000001; // 默认 IE=1 (使能)
            cause  <= 0;
            epc    <= 0;
        end else begin
            if (exception_i) begin
                epc <= epc_i;
                cause[15:10] <= ext_int; // 记录是哪个硬件中断
            end else if (we) begin
                case(addr)
                    5'd12: status <= din;
                    5'd13: cause  <= din;
                    5'd14: epc    <= din;
                endcase
            end
        end
    end

    always @* begin
        case(addr)
            5'd12: data_o = status;
            5'd13: data_o = cause;
            5'd14: data_o = epc;
            default: data_o = 0;
        endcase
    end
endmodule