`timescale 1ns / 1ps
module keyboard(
    input  wire        clk,
    input  wire        rst,
    input  wire [3:0]  col,     // Input: K3, L3, J4, K4
    output reg  [3:0]  row,     // Output: L5, J6, K6, M2
    output reg  [3:0]  key_out,
    output reg         pressed
);

    // =========================================================
    // 1. 扫描与采样控制
    // =========================================================
    // 计数器范围：0 ~ 2^20-1 (约 10ms 一个循环)
    reg [19:0] cnt;
    always @(posedge clk) begin
        if (rst) cnt <= 0;
        else cnt <= cnt + 1;
    end

    // [19:18] 高2位决定当前扫描哪一行 (每行约 2.6ms)
    wire [1:0] scan_idx = cnt[19:18];

    // 【核心修复】采样触发信号
    // 我们不在行切换的瞬间读取，而是等计数器走到中间 (0x20000) 时才读取
    // 这时候行电压已经稳定了至少 1.3ms，绝对不会有残影！
    wire sample_now = (cnt[17:0] == 18'h20000);

    // =========================================================
    // 2. 行扫描输出 (Active Low)
    // =========================================================
    always @* begin
        case (scan_idx)
            2'd0: row = 4'b1110; // Row 0 (M2)
            2'd1: row = 4'b1101; // Row 1 (K6)
            2'd2: row = 4'b1011; // Row 2 (J6)
            2'd3: row = 4'b0111; // Row 3 (L5)
        endcase
    end

    // =========================================================
    // 3. 稳定采样与映射 (带映射修正)
    // =========================================================
    reg [24:0] hold_timer;
    
    always @(posedge clk) begin
        if (rst) begin
            pressed <= 0;
            key_out <= 0;
            hold_timer <= 0;
        end else begin
            // 只在采样时刻 (sample_now) 检查按键
            if (sample_now && col != 4'b1111) begin
                pressed <= 1;
                hold_timer <= 25'd20_000_000; // 保持 0.2s

                // 根据你的测试结果修正的映射表
                case (scan_idx)
                    // --- 扫描 Row 0 (M2) ---
                    // 之前测试: 1->E(Col3), 2->无反应/0(Col2)
                    2'd0: begin
                        if (!col[3]) key_out <= 1;  // K3 -> 1
                        if (!col[2]) key_out <= 2;  // L3 -> 2
                        if (!col[1]) key_out <= 3;  // J4 -> 猜它是3
                        if (!col[0]) key_out <= 10; // K4 -> A
                    end
                    
                    // --- 扫描 Row 1 (K6) ---
                    // 这一行还没测到，先按顺序填，如果不对应再改
                    2'd1: begin
                        if (!col[3]) key_out <= 4;
                        if (!col[2]) key_out <= 5;
                        if (!col[1]) key_out <= 6;
                        if (!col[0]) key_out <= 11; // B
                    end

                    // --- 扫描 Row 2 (J6) ---
                    // 之前测试: 3->4(Col3), A->6(Col1)
                    2'd2: begin
                        if (!col[3]) key_out <= 3;  // K3 -> 3 (修正: 这里可能是复用的)
                        // 注意：如果按3既触发Row0又触发Row2，说明3在K3列，且Row0/2短路？
                        // 但有了稳定采样，应该只会触发其中一个。
                        // 根据你的测试 "3显示4"，4是Row2/Col3。所以Row2/Col3改成3。
                        
                        if (!col[3]) key_out <= 3;  // 修正为 3
                        if (!col[2]) key_out <= 4;  // L3 -> 4
                        if (!col[1]) key_out <= 10; // 修正为 A (原测试: A->6, 6是Row2/Col1)
                        if (!col[0]) key_out <= 12; // C
                    end

                    // --- 扫描 Row 3 (L5) ---
                    2'd3: begin
                        if (!col[3]) key_out <= 7;
                        if (!col[2]) key_out <= 8;
                        if (!col[1]) key_out <= 9;
                        if (!col[0]) key_out <= 13; // D
                    end
                endcase
            end 
            // 倒计时逻辑
            else if (hold_timer > 0) begin
                hold_timer <= hold_timer - 1;
            end 
            else begin
                pressed <= 0;
            end
        end
    end

endmodule