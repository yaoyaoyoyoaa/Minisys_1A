/* instruction.js */
(function() {
    window.MiniSys = window.MiniSys || {};
    const Utils = window.MiniSys.Utils;
    const Reg = window.MiniSys.Register;

    class Instruction {
        constructor(symbol, desc, pseudo, insPattern, components) {
            this.symbol = symbol;
            this.desc = desc;
            this.pseudo = pseudo;
            this.insPattern = insPattern;
            // 转换 components 为处理函数
            this.components = components.map(x => ({
                lBit: x[0],
                rBit: x[1],
                desc: x[2],
                toBinary: x[3], // 函数
                type: x[4],
                val: x[5]
            }));
        }
    }

    const instructions = [];
    const newIns = (sym, desc, pseudo, pattern, comps) => {
        instructions.push(new Instruction(sym, desc, pseudo, pattern, comps));
    };
    
    // 辅助：参数正则生成器
    // type: 0=无参, 1=1参, 2=2参...
    const paramPattern = (num) => {
        // 简化版，实际标准版可能更复杂
        if(num === 3) return /^\s*(\$\w+)\s*,\s*(\$\w+)\s*,\s*(-?0x[\da-f]+|-?\d+|\$\w+)\s*$/i;
        if(num === 2) return /^\s*(\$\w+)\s*,\s*(-?0x[\da-f]+|-?\d+|\$\w+)\s*$/i; 
        return /.*/; // 默认匹配
    };
    
    const noop = () => {};

    // --- 标准版指令集 (部分核心指令，确保涵盖编译器输出) ---
    
    // R-Type (add, sub, and, or, xor, nor, slt)
    [['add',0x20], ['addu',0x21], ['sub',0x22], ['subu',0x23], ['and',0x24], ['or',0x25], ['xor',0x26], ['nor',0x27], ['slt',0x2A], ['sltu',0x2B]].forEach(([op, func]) => {
        newIns(op, 'R-Type Calculation', '', /^\s*(\$\w+)\s*,\s*(\$\w+)\s*,\s*(\$\w+)\s*$/i, [
            [31,26,'op',noop,'fixed','000000'],
            [25,21,'rs',()=>Reg.regToBin(RegExp.$2),'reg',''],
            [20,16,'rt',()=>Reg.regToBin(RegExp.$3),'reg',''],
            [15,11,'rd',()=>Reg.regToBin(RegExp.$1),'reg',''],
            [10,6,'shamt',noop,'fixed','00000'],
            [5,0,'funct',noop,'fixed',Utils.decToBin(func,6)]
        ]);
    });

    // I-Type (addi, addiu, etc)
    [['addi',0x08], ['addiu',0x09], ['andi',0x0C], ['ori',0x0D], ['xori',0x0E], ['slti',0x0A], ['sltiu',0x0B]].forEach(([op, code]) => {
        newIns(op, 'I-Type Calc', '', /^\s*(\$\w+)\s*,\s*(\$\w+)\s*,\s*(-?0x[\da-f]+|-?\d+)\s*$/i, [
            [31,26,'op',noop,'fixed',Utils.decToBin(code,6)],
            [25,21,'rs',()=>Reg.regToBin(RegExp.$2),'reg',''],
            [20,16,'rt',()=>Reg.regToBin(RegExp.$1),'reg',''],
            [15,0,'imm',()=>Utils.literalToBin(RegExp.$3,16),'immed','']
        ]);
    });

    // Load/Store (lw, sw)
    [['lw',0x23], ['sw',0x2B], ['lb',0x20], ['sb',0x28]].forEach(([op, code]) => {
        newIns(op, 'Memory Access', '', /^\s*(\$\w+)\s*,\s*(-?0x[\da-f]+|-?\d+)\((\$\w+)\)\s*$/i, [
            [31,26,'op',noop,'fixed',Utils.decToBin(code,6)],
            [25,21,'rs',()=>Reg.regToBin(RegExp.$3),'reg',''],
            [20,16,'rt',()=>Reg.regToBin(RegExp.$1),'reg',''],
            [15,0,'offset',()=>Utils.literalToBin(RegExp.$2,16),'immed','']
        ]);
    });

    // Branch (beq, bne)
    [['beq',0x04], ['bne',0x05]].forEach(([op, code]) => {
        newIns(op, 'Branch', '', /^\s*(\$\w+)\s*,\s*(\$\w+)\s*,\s*(\w+)\s*$/i, [
            [31,26,'op',noop,'fixed',Utils.decToBin(code,6)],
            [25,21,'rs',()=>Reg.regToBin(RegExp.$1),'reg',''],
            [20,16,'rt',()=>Reg.regToBin(RegExp.$2),'reg',''],
            // 注意：labelToBin 返回对象，由 Assembler 二次处理
            [15,0,'offset',()=>Utils.labelToBin(RegExp.$3,16,true),'label','']
        ]);
    });

    // Jump (j, jal)
    [['j',0x02], ['jal',0x03]].forEach(([op, code]) => {
        newIns(op, 'Jump', '', /^\s*(\w+)\s*$/i, [
            [31,26,'op',noop,'fixed',Utils.decToBin(code,6)],
            [25,0,'target',()=>Utils.labelToBin(RegExp.$1,26,false),'label','']
        ]);
    });
    
    // Jr
    newIns('jr', 'Jump Register', '', /^\s*(\$\w+)\s*$/i, [
        [31,26,'op',noop,'fixed','000000'],
        [25,21,'rs',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [20,0,'funct',noop,'fixed','000000000000000001000']
    ]);

    // Lui
    newIns('lui', 'Load Upper Imm', '', /^\s*(\$\w+)\s*,\s*(-?0x[\da-f]+|-?\d+)\s*$/i, [
        [31,26,'op',noop,'fixed','001111'],
        [25,21,'rs',noop,'fixed','00000'],
        [20,16,'rt',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [15,0,'imm',()=>Utils.literalToBin(RegExp.$2,16),'immed','']
    ]);
    
    // NOP
    newIns('nop', 'No Operation', '', /^$/, [
        [31,0,'val',noop,'fixed','0'.repeat(32)]
    ]);
    
    // 乘除法 (mult, div, mflo, mfhi)
    newIns('mult', 'Multiply', '', /^\s*(\$\w+)\s*,\s*(\$\w+)\s*$/i, [
        [31,26,'op',noop,'fixed','000000'],
        [25,21,'rs',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [20,16,'rt',()=>Reg.regToBin(RegExp.$2),'reg',''],
        [15,6,'zeros',noop,'fixed','0000000000'],
        [5,0,'funct',noop,'fixed','011000'] // 0x18
    ]);
    newIns('div', 'Divide', '', /^\s*(\$\w+)\s*,\s*(\$\w+)\s*$/i, [
        [31,26,'op',noop,'fixed','000000'],
        [25,21,'rs',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [20,16,'rt',()=>Reg.regToBin(RegExp.$2),'reg',''],
        [15,6,'zeros',noop,'fixed','0000000000'],
        [5,0,'funct',noop,'fixed','011010'] // 0x1A
    ]);
    newIns('mflo', 'Move from LO', '', /^\s*(\$\w+)\s*$/i, [
        [31,26,'op',noop,'fixed','000000'],
        [25,16,'zeros',noop,'fixed','0000000000'],
        [15,11,'rd',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [10,6,'zeros',noop,'fixed','00000'],
        [5,0,'funct',noop,'fixed','010010'] // 0x12
    ]);
    newIns('mfhi', 'Move from HI', '', /^\s*(\$\w+)\s*$/i, [
        [31,26,'op',noop,'fixed','000000'],
        [25,16,'zeros',noop,'fixed','0000000000'],
        [15,11,'rd',()=>Reg.regToBin(RegExp.$1),'reg',''],
        [10,6,'zeros',noop,'fixed','00000'],
        [5,0,'funct',noop,'fixed','010000'] // 0x10
    ]);

    window.MiniSys.Instruction = Instruction;
    window.MiniSys.MinisysInstructions = instructions;
})();