`timescale 1ns / 1ps
// keyboard.v - 4x4 矩阵键盘控制器
module keyboard(
    input  wire        clk,
    input  wire        rst,
    input  wire [3:0]  col,     // 列输入 (Input from Board)
    output reg  [3:0]  row,     // 行扫描 (Output to Board)
    output reg  [3:0]  key_out, // 键值 0-F
    output reg         pressed  // 1=按下, 0=松开
);

    // 扫描频率计数器 (100MHz / 2^20 ≈ 95Hz 扫描率)
    reg [19:0] cnt;
    reg [1:0]  scan_idx; // 当前扫描的行 (0-3)

    always @(posedge clk) begin
        if (rst) begin
            cnt <= 0;
            scan_idx <= 0;
        end else begin
            cnt <= cnt + 1;
            if (cnt == 20'hFFFFF) begin
                scan_idx <= scan_idx + 1;
            end
        end
    end

    // 行扫描逻辑 (低电平有效)
    always @* begin
        case (scan_idx)
            2'd0: row = 4'b1110; // Row 0
            2'd1: row = 4'b1101; // Row 1
            2'd2: row = 4'b1011; // Row 2
            2'd3: row = 4'b0111; // Row 3
        endcase
    end

    // 键值检测与暂存
    reg [4:0] detect_val; // {valid, code}

    always @(posedge clk) begin
        if (rst) begin
            key_out <= 0;
            pressed <= 0;
        end else if (cnt == 20'hFFFFF) begin 
            // 在切换行之前采样
            detect_val = 0;
            
            case (scan_idx)
                // Row 0: 1, 2, 3, 4
                2'd0: begin
                    if (!col[0]) detect_val = {1'b1, 4'h1};
                    if (!col[1]) detect_val = {1'b1, 4'h2};
                    if (!col[2]) detect_val = {1'b1, 4'h3};
                    if (!col[3]) detect_val = {1'b1, 4'h4};
                end
                // Row 1: 5, 6, 7, 8
                2'd1: begin
                    if (!col[0]) detect_val = {1'b1, 4'h5};
                    if (!col[1]) detect_val = {1'b1, 4'h6};
                    if (!col[2]) detect_val = {1'b1, 4'h7};
                    if (!col[3]) detect_val = {1'b1, 4'h8};
                end
                // Row 2: 9, 0, A, B (A=10, B=11)
                2'd2: begin
                    if (!col[0]) detect_val = {1'b1, 4'h9};
                    if (!col[1]) detect_val = {1'b1, 4'h0};
                    if (!col[2]) detect_val = {1'b1, 4'hA};
                    if (!col[3]) detect_val = {1'b1, 4'hB};
                end
                // Row 3: C, D, E, F (C=12, D=13, E=14, F=15)
                2'd3: begin
                    if (!col[0]) detect_val = {1'b1, 4'hC}; // 通常丝印 F
                    if (!col[1]) detect_val = {1'b1, 4'hD}; // 通常丝印 E
                    if (!col[2]) detect_val = {1'b1, 4'hE}; // 通常丝印 D
                    if (!col[3]) detect_val = {1'b1, 4'hF}; // 通常丝印 C
                    // 注意：这里是按标准矩阵推算的，如果板子 F/C 位置互换，这里代码微调即可
                end
            endcase

            // 如果检测到按键，更新输出
            if (detect_val[4]) begin
                key_out <= detect_val[3:0];
                pressed <= 1;
            end 
            // 简易松开检测：如果一轮扫描(例如scan_idx回到3)且当前无键，可视情况清零
            // 这里为了让 CPU 容易读取，我们保持 last value
            // 真实 pressed 信号应该是一个脉冲或持续电平，这里简化为"有新键刷新时置1"
            // 为了配合你的 0xFC12 查询，建议增加一个自动复位逻辑：
            else if (col == 4'b1111 && scan_idx == 3) begin
                 // 如果所有列都松开，且扫完了一轮
                 pressed <= 0;
            end
        end
    end

endmodule