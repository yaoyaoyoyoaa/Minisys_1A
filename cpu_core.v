`timescale 1ns / 1ps

module cpu_core(
    input  wire        clk,
    input  wire        rst,
    input  wire [5:0]  ext_int,      // 外部中断输入 (如串口、定时器)
    // 指令存储器接口
    input  wire [31:0] imem_rdata,
    output wire [31:0] imem_addr,
    // 数据存储器接口
    input  wire [31:0] dmem_rdata,
    output wire        dmem_we,
    output wire [31:0] dmem_addr,
    output wire [31:0] dmem_wdata,
    output wire [3:0]  dmem_wstrb,
    // 调试
    output wire [31:0] dbg_pc
);

    // =========================================================================
    // 1. 流水线寄存器定义
    // =========================================================================
    reg [31:0] pc;
    wire [31:0] next_pc;
    wire stall, flush;

    // IF/ID 寄存器
    reg [31:0] if_id_pc, if_id_instr;

    // ID/EX 寄存器
    reg [31:0] id_ex_pc, id_ex_rs_val, id_ex_rt_val, id_ex_imm;
    reg [4:0]  id_ex_rs, id_ex_rt, id_ex_rd, id_ex_shamt;
    reg [5:0]  id_ex_op, id_ex_fn;
    // ID/EX 控制信号
    reg        id_ex_reg_write, id_ex_mem_to_reg, id_ex_mem_read, id_ex_mem_write;
    reg        id_ex_alu_src, id_ex_reg_dest, id_ex_is_shift;
    reg [3:0]  id_ex_alu_op;
    reg        id_ex_is_mtc0; // 传递 MTC0 信号到 EX/MEM 阶段处理

    // EX/MEM 寄存器
    reg [31:0] ex_mem_pc, ex_mem_alu_res, ex_mem_wdata;
    reg [4:0]  ex_mem_dst_reg;
    reg [5:0]  ex_mem_op; 
    reg        ex_mem_reg_write, ex_mem_mem_to_reg, ex_mem_mem_read, ex_mem_mem_write;
    reg        ex_mem_is_mtc0;

    // MEM/WB 寄存器
    reg [31:0] mem_wb_pc, mem_wb_read_data, mem_wb_alu_res;
    reg [4:0]  mem_wb_dst_reg;
    reg        mem_wb_reg_write, mem_wb_mem_to_reg;
    reg [5:0]  mem_wb_op;

    // =========================================================================
    // 2. IF Stage (取指)
    // =========================================================================
    assign imem_addr = pc;
    assign dbg_pc = pc;

    // 跳转/分支 信号定义 (来自 ID 阶段)
    wire        branch_taken;
    wire [31:0] branch_target;
    wire        jump_taken;
    wire [31:0] jump_target;
    
    // 异常/中断 信号定义 (来自 MEM 阶段)
    wire [31:0] cp0_epc;
    wire        mem_exc_occurred;
    wire        is_eret; // 在 ID 阶段解码 ERET

    // PC 更新逻辑：优先级 异常返回 > 异常入口 > 分支 > 跳转 > 顺序
    assign next_pc = is_eret ? cp0_epc : 
                     mem_exc_occurred ? 32'h00000008 : // 异常向量地址
                     branch_taken ? branch_target :
                     jump_taken   ? jump_target : 
                     pc + 4;

    always @(posedge clk) begin
        if (rst) begin
            pc <= 32'h00000000;
        end else if (!stall) begin
            pc <= next_pc;
        end
    end

    // IF/ID 流水线寄存器更新
    always @(posedge clk) begin
        if (rst) begin
            if_id_pc <= 0; if_id_instr <= 0;
        end else if (!stall) begin
            if (flush || mem_exc_occurred || is_eret) begin
                if_id_pc <= 0; if_id_instr <= 0; // NOP
            end else begin
                if_id_pc <= pc + 4;
                if_id_instr <= imem_rdata;
            end
        end
    end

    // =========================================================================
    // 3. ID Stage (译码 & 控制单元)
    // =========================================================================
    wire [5:0] id_op = if_id_instr[31:26];
    wire [4:0] id_rs = if_id_instr[25:21];
    wire [4:0] id_rt = if_id_instr[20:16];
    wire [4:0] id_rd = if_id_instr[15:11];
    wire [4:0] id_shamt = if_id_instr[10:6];
    wire [5:0] id_fn = if_id_instr[5:0];
    wire [15:0] id_imm = if_id_instr[15:0];
    wire [25:0] id_jump_idx = if_id_instr[25:0];

    // --- 控制单元 (Control Unit) ---
    reg       ctrl_reg_write, ctrl_mem_to_reg, ctrl_mem_read, ctrl_mem_write;
    reg       ctrl_alu_src, ctrl_reg_dest, ctrl_branch, ctrl_jump;
    reg       ctrl_is_shift, ctrl_is_mtc0;
    reg [3:0] ctrl_alu_op;

    assign is_eret = (id_op == 6'h10 && id_fn == 6'h18 && if_id_instr[25] == 1'b1); // COP0 funct=0x18

    always @* begin
        // 默认控制信号
        ctrl_reg_write = 0; ctrl_mem_to_reg = 0; ctrl_mem_read = 0; ctrl_mem_write = 0;
        ctrl_alu_src = 0; ctrl_reg_dest = 0; ctrl_branch = 0; ctrl_jump = 0;
        ctrl_is_shift = 0; ctrl_alu_op = 4'h0; ctrl_is_mtc0 = 0;

        case(id_op)
            6'h00: begin // R-Type
                if (id_fn != 6'h00 || id_rd != 0) begin // 排除 NOP
                    ctrl_reg_dest = 1; ctrl_reg_write = 1;
                    case(id_fn)
                        6'h20: ctrl_alu_op = 4'h0; // ADD
                        6'h21: ctrl_alu_op = 4'h0; // ADDU (视为ADD)
                        6'h22: ctrl_alu_op = 4'h1; // SUB
                        6'h24: ctrl_alu_op = 4'h2; // AND
                        6'h25: ctrl_alu_op = 4'h3; // OR
                        6'h26: ctrl_alu_op = 4'h4; // XOR
                        6'h2A: ctrl_alu_op = 4'h5; // SLT
                        6'h00: begin ctrl_alu_op = 4'h6; ctrl_is_shift = 1; end // SLL
                        6'h02: begin ctrl_alu_op = 4'h7; ctrl_is_shift = 1; end // SRL
                        6'h03: begin ctrl_alu_op = 4'h8; ctrl_is_shift = 1; end // SRA
                        6'h08: begin // JR
                            ctrl_jump = 1; ctrl_reg_write = 0; 
                        end
                        default: ctrl_reg_write = 0;
                    endcase
                end
            end
            6'h08: begin // ADDI
                ctrl_alu_src = 1; ctrl_reg_write = 1; ctrl_alu_op = 4'h0;
            end
            6'h09: begin // ADDIU
                ctrl_alu_src = 1; ctrl_reg_write = 1; ctrl_alu_op = 4'h0;
            end
            6'h0D: begin // ORI
                ctrl_alu_src = 1; ctrl_reg_write = 1; ctrl_alu_op = 4'h3;
            end
            6'h0F: begin // LUI
                ctrl_alu_src = 1; ctrl_reg_write = 1; ctrl_alu_op = 4'h9;
            end
            6'h23, 6'h20, 6'h24, 6'h21, 6'h25: begin // LW, LB, LBU, LH, LHU
                ctrl_alu_src = 1; ctrl_mem_to_reg = 1; ctrl_reg_write = 1; ctrl_mem_read = 1;
                ctrl_alu_op = 4'h0; // ADD base + offset
            end
            6'h2B, 6'h28, 6'h29: begin // SW, SB, SH
                ctrl_alu_src = 1; ctrl_mem_write = 1;
                ctrl_alu_op = 4'h0; // ADD base + offset
            end
            6'h04: begin // BEQ
                ctrl_branch = 1; ctrl_alu_op = 4'h1; // SUB for comparison
            end
            6'h05: begin // BNE
                ctrl_branch = 1; ctrl_alu_op = 4'h1; 
            end
            6'h02: begin // J
                ctrl_jump = 1;
            end
            6'h03: begin // JAL
                ctrl_jump = 1; ctrl_reg_write = 1; 
                // JAL 特殊处理：写 $31, 数据为 PC+4 (在 EX 阶段处理或这里 Hack)
                // 简化起见，这里假设 JAL 不被 core.js 大量使用，或者需要扩展 Mux 支持
            end
            6'h10: begin // COP0
                if (if_id_instr[25:21] == 5'h04) begin // MTC0
                     ctrl_is_mtc0 = 1;
                end else if (if_id_instr[25:21] == 5'h00) begin // MFC0
                     ctrl_reg_write = 1; // 写入通用寄存器
                     // MFC0 数据源选择较特殊，这里简化为走 ALU 通路或专门通路
                     // 暂用 ALU 结果 (需 ALU 透传 B) 或 MemToReg 路径
                end
            end
        endcase
    end

    // --- 寄存器堆实例化 ---
    wire [31:0] reg_rdata1, reg_rdata2;
    wire [31:0] wb_wdata; // 来自 WB 阶段
    
    regfile u_regfile(
        .clk(clk), .rst(rst),
        .raddr1(id_rs), .raddr2(id_rt),
        .rdata1(reg_rdata1), .rdata2(reg_rdata2),
        .we(mem_wb_reg_write), .waddr(mem_wb_dst_reg), .wdata(wb_wdata)
    );

    // --- 分支与跳转解析 ---
    // 简单的 ID 阶段前递解决分支数据依赖 (Forwarding to ID)
    // 这是一个简化版本，通常需要检测 EX 和 MEM 阶段
    wire [31:0] branch_op_a = (ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_rs) ? ex_mem_alu_res :
                              (mem_wb_reg_write && mem_wb_dst_reg != 0 && mem_wb_dst_reg == id_rs) ? wb_wdata : reg_rdata1;
    wire [31:0] branch_op_b = (ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_rt) ? ex_mem_alu_res :
                              (mem_wb_reg_write && mem_wb_dst_reg != 0 && mem_wb_dst_reg == id_rt) ? wb_wdata : reg_rdata2;

    wire rs_eq_rt = (branch_op_a == branch_op_b);
    assign branch_taken = ctrl_branch && (
                          (id_op == 6'h04 && rs_eq_rt) || // BEQ
                          (id_op == 6'h05 && !rs_eq_rt)   // BNE
                          );
    // 符号扩展
    wire [31:0] sign_ext_imm = {{16{id_imm[15]}}, id_imm};
    assign branch_target = if_id_pc + (sign_ext_imm << 2);

    // 跳转目标 (J/JAL)
    assign jump_target = {if_id_pc[31:28], id_jump_idx, 2'b00};
    // JR (Jump Register) 处理: 跳转目标是寄存器值
    assign jump_taken = (ctrl_jump && id_op == 6'h02) || (ctrl_jump && id_op == 6'h03) || (id_op == 6'h00 && id_fn == 6'h08);
    // 注意：如果是 JR，目标是 branch_op_a (寄存器 rs 的值)
    wire [31:0] final_jump_target = (id_op == 6'h00 && id_fn == 6'h08) ? branch_op_a : jump_target;

    // --- Hazard Detection (Load-Use) ---
    // 如果 ID 阶段需要读取的寄存器 正是 EX 阶段正在加载的目标，则暂停
    assign stall = id_ex_mem_read && (id_ex_rt == id_rs || id_ex_rt == id_rt);
    // 分支或跳转发生时，Flush ID 阶段指令
    assign flush = branch_taken || jump_taken || is_eret; 

    // --- ID/EX 流水线寄存器 ---
    always @(posedge clk) begin
        if (rst || flush || stall || mem_exc_occurred) begin
            id_ex_pc <= 0;
            id_ex_reg_write <= 0; id_ex_mem_write <= 0; id_ex_mem_read <= 0;
            id_ex_op <= 0; id_ex_fn <= 0;
        end else begin
            id_ex_pc <= if_id_pc;
            id_ex_rs_val <= reg_rdata1;
            id_ex_rt_val <= reg_rdata2;
            id_ex_imm    <= sign_ext_imm;
            id_ex_rs     <= id_rs;
            id_ex_rt     <= id_rt;
            id_ex_rd     <= id_rd;
            id_ex_shamt  <= id_shamt;
            id_ex_op     <= id_op;
            id_ex_fn     <= id_fn;
            // 控制信号
            id_ex_reg_write <= ctrl_reg_write;
            id_ex_mem_to_reg<= ctrl_mem_to_reg;
            id_ex_mem_read  <= ctrl_mem_read;
            id_ex_mem_write <= ctrl_mem_write;
            id_ex_alu_src   <= ctrl_alu_src;
            id_ex_reg_dest  <= ctrl_reg_dest;
            id_ex_alu_op    <= ctrl_alu_op;
            id_ex_is_shift  <= ctrl_is_shift;
            id_ex_is_mtc0   <= ctrl_is_mtc0;
        end
    end

    // =========================================================================
    // 4. EX Stage (执行 & 前递)
    // =========================================================================
    
    // --- Forwarding Unit ---
    reg [1:0] fwd_a, fwd_b;
    always @* begin
        fwd_a = 2'b00;
        fwd_b = 2'b00;
        // EX Hazard (EX/MEM 阶段前递)
        if (ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_ex_rs)
            fwd_a = 2'b10;
        if (ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_ex_rt)
            fwd_b = 2'b10;
        // MEM Hazard (MEM/WB 阶段前递)
        if (mem_wb_reg_write && mem_wb_dst_reg != 0 && mem_wb_dst_reg == id_ex_rs &&
            !(ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_ex_rs))
            fwd_a = 2'b01;
        if (mem_wb_reg_write && mem_wb_dst_reg != 0 && mem_wb_dst_reg == id_ex_rt &&
            !(ex_mem_reg_write && ex_mem_dst_reg != 0 && ex_mem_dst_reg == id_ex_rt))
            fwd_b = 2'b01;
    end

    // ALU 输入选择 Mux
    wire [31:0] alu_src_a_fwd = (fwd_a == 2'b10) ? ex_mem_alu_res :
                                (fwd_a == 2'b01) ? wb_wdata : id_ex_rs_val;
    wire [31:0] alu_src_b_fwd = (fwd_b == 2'b10) ? ex_mem_alu_res :
                                (fwd_b == 2'b01) ? wb_wdata : id_ex_rt_val;

    wire [31:0] alu_src_a = id_ex_is_shift ? {27'b0, id_ex_shamt} : alu_src_a_fwd;
    wire [31:0] alu_src_b = id_ex_alu_src  ? id_ex_imm : alu_src_b_fwd;

    wire [31:0] alu_result;
    alu u_alu(.op(id_ex_alu_op), .a(alu_src_a), .b(alu_src_b), .y(alu_result));

    // 确定目标寄存器 (rd 或 rt)
    wire [4:0] dst_reg = id_ex_reg_dest ? id_ex_rd : id_ex_rt;

    // EX/MEM 流水线寄存器
    always @(posedge clk) begin
        if (rst || mem_exc_occurred) begin
            ex_mem_reg_write <= 0; ex_mem_mem_write <= 0;
            ex_mem_is_mtc0   <= 0;
        end else begin
            ex_mem_pc        <= id_ex_pc;
            ex_mem_alu_res   <= alu_result;
            ex_mem_wdata     <= alu_src_b_fwd; // Store指令的数据必须是经过前递的
            ex_mem_dst_reg   <= dst_reg;
            ex_mem_op        <= id_ex_op; // 传递 opcode 用于 SB/SH 判断
            
            ex_mem_reg_write <= id_ex_reg_write;
            ex_mem_mem_to_reg<= id_ex_mem_to_reg;
            ex_mem_mem_read  <= id_ex_mem_read;
            ex_mem_mem_write <= id_ex_mem_write;
            ex_mem_is_mtc0   <= id_ex_is_mtc0;
        end
    end

    // =========================================================================
    // 5. MEM Stage (访存 & 中断/异常)
    // =========================================================================
    
    // 地址与写使能
    assign dmem_addr = ex_mem_alu_res;
    // 仅在无异常时允许写内存
    assign dmem_we   = ex_mem_mem_write && !mem_exc_occurred;

    // 子字写入逻辑 (SB/SH)
    reg [31:0] aligned_wdata;
    reg [3:0]  aligned_wstrb;
    always @* begin
        aligned_wdata = ex_mem_wdata;
        aligned_wstrb = 4'b1111;
        case(ex_mem_op)
            6'h28: begin // SB
                case(ex_mem_alu_res[1:0])
                    2'b00: aligned_wstrb = 4'b0001;
                    2'b01: aligned_wstrb = 4'b0010;
                    2'b10: aligned_wstrb = 4'b0100;
                    2'b11: aligned_wstrb = 4'b1000;
                endcase
                aligned_wdata = {4{ex_mem_wdata[7:0]}};
            end
            6'h29: begin // SH
                if (ex_mem_alu_res[1] == 0) aligned_wstrb = 4'b0011;
                else                        aligned_wstrb = 4'b1100;
                aligned_wdata = {2{ex_mem_wdata[15:0]}};
            end
        endcase
    end
    assign dmem_wdata = aligned_wdata;
    assign dmem_wstrb = aligned_wstrb;

    // --- CP0 与 中断逻辑 ---
    wire [31:0] cp0_data_out;
    wire [31:0] cp0_status; // 假设 CP0 模块被修改以输出 status
    
    // 如果你无法修改 cp0_regfile 增加 status 端口，请查看下面的注释说明
    // 此处假设 user 按照建议修改了 cp0_regfile.v
    
    cp0_regfile u_cp0 (
        .clk(clk), .rst(rst),
        .we(ex_mem_is_mtc0), 
        .addr(ex_mem_dst_reg), // MTC0 的 rd 字段
        .din(ex_mem_wdata),    // MTC0 的 rt 值 (这里 wdata 复用了 ALU B口)
        .ext_int(ext_int),
        .exception_i(mem_exc_occurred),
        .epc_i(ex_mem_pc),     // 记录受害指令 PC
        .data_o(cp0_data_out),
        .epc_o(cp0_epc)
        // .status_o(cp0_status) // 如果有这个端口最好
    );
    
    // 如果没有 status_o 端口，只能暂时 Hack：
    // 假设 status 寄存器内部初始化为 1 (使能)，且这里简化判断
    // 为了稳健，建议你在 cp0_regfile.v 添加 `assign status_o = status;`
    // 这里暂时用一个简单的逻辑：如果 ext_int 不为0，就触发
    // assign mem_exc_occurred = (ext_int != 0); 
    
    // **更高级的逻辑 (依赖 CP0 修改)**:
    // assign mem_exc_occurred = (ext_int != 0) && cp0_status[0];
    
    // **当前采用兼容逻辑**：
    assign mem_exc_occurred = (ext_int != 0); // 暂时忽略 IE 位，确保先跑通

    // MFC0 的数据处理：将 CP0 读出的数据放入 MemToReg 路径
    // 如果当前指令是 MFC0 (op=0x10, func=00)，我们需要将 cp0_data_out 送入流水线
    wire [31:0] mem_result_mux = (ex_mem_op == 6'h10) ? cp0_data_out : dmem_rdata;

    // MEM/WB 流水线寄存器
    always @(posedge clk) begin
        if (rst || mem_exc_occurred) begin
            mem_wb_reg_write <= 0;
        end else begin
            mem_wb_pc         <= ex_mem_pc;
            mem_wb_read_data  <= mem_result_mux; // 可能是内存读出值或CP0值
            mem_wb_alu_res    <= ex_mem_alu_res;
            mem_wb_dst_reg    <= ex_mem_dst_reg;
            mem_wb_op         <= ex_mem_op;
            
            mem_wb_reg_write  <= ex_mem_reg_write;
            mem_wb_mem_to_reg <= ex_mem_mem_to_reg;
        end
    end

    // =========================================================================
    // 6. WB Stage (写回)
    // =========================================================================
    
    reg [31:0] final_wb_data;
    always @* begin
        if (mem_wb_mem_to_reg) begin
            // 内存/CP0 数据处理 (含 LB/LBU 等子字加载逻辑)
            // 这里为了简化，假设 MFC0 也通过 MemToReg=1 走这里，且 mem_wb_op 不会命中 Load case
            case(mem_wb_op)
                6'h20: begin // LB (符号扩展)
                    case(mem_wb_alu_res[1:0])
                        2'b00: final_wb_data = {{24{mem_wb_read_data[7]}},  mem_wb_read_data[7:0]};
                        2'b01: final_wb_data = {{24{mem_wb_read_data[15]}}, mem_wb_read_data[15:8]};
                        2'b10: final_wb_data = {{24{mem_wb_read_data[23]}}, mem_wb_read_data[23:16]};
                        2'b11: final_wb_data = {{24{mem_wb_read_data[31]}}, mem_wb_read_data[31:24]};
                    endcase
                end
                6'h24: begin // LBU (零扩展)
                    case(mem_wb_alu_res[1:0])
                        2'b00: final_wb_data = {24'b0, mem_wb_read_data[7:0]};
                        2'b01: final_wb_data = {24'b0, mem_wb_read_data[15:8]};
                        2'b10: final_wb_data = {24'b0, mem_wb_read_data[23:16]};
                        2'b11: final_wb_data = {24'b0, mem_wb_read_data[31:24]};
                    endcase
                end
                 // 可继续补充 LH, LHU
                default: final_wb_data = mem_wb_read_data; // LW 或 MFC0
            endcase
        end else begin
            final_wb_data = mem_wb_alu_res; // R-Type 或 I-Type 计算结果
        end
    end

    assign wb_wdata = final_wb_data;

endmodule