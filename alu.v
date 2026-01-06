// alu.v - 算术逻辑单元
module alu(
    input  wire [3:0]  op,
    input  wire [31:0] a,
    input  wire [31:0] b,
    output reg  [31:0] y
);
    always @* begin
        case(op)
            4'h0: y = a + b;          // ADD / ADDI
            4'h1: y = a - b;          // SUB
            4'h2: y = a & b;          // AND
            4'h3: y = a | b;          // OR
            4'h4: y = a ^ b;          // XOR
            4'h5: y = ($signed(a) < $signed(b)) ? 32'h1 : 32'h0; // SLT
            4'h6: y = b << a[4:0];    // SLL
            4'h7: y = b >> a[4:0];    // SRL
            4'h8: y = $signed(b) >>> a[4:0]; // SRA
            4'h9: y = {b[15:0], 16'h0}; // LUI
            default: y = 32'h0;
        endcase
    end
endmodule

