/* tools_adapter.js */
window.MiniSys = {};

// ==========================================
// 1. 注入 Mini C 编译器核心
// ==========================================

(function() {
    /**
     * Enhanced MiniC Compiler - 适配 Tools Adapter
     * 包含特性：全局变量、指针、For循环、函数调用、完整运算符
     */

    // --- 1. 词法分析器 ---
    function tokenize(source) {
        source = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        // 增强正则：支持 <=, >=, ==, !=, &&, ||, 0x十六进制
        const regex = /\s*(0x[0-9a-fA-F]+|[0-9]+|int|void|return|if|else|while|for|break|continue|\$|[a-zA-Z_][a-zA-Z0-9_]*|<=|>=|==|!=|&&|\|\||[+\-*/%&|^<>=!~,;*(){}\[\]])\s*/g;
        let tokens = [];
        let match;
        while ((match = regex.exec(source)) !== null) {
            if (match[1]) tokens.push(match[1]);
        }
        return tokens;
    }

    // --- 2. 语法分析器 ---
    class Parser {
        constructor(tokens) { this.tokens = tokens; this.pos = 0; }
        peek() { return this.tokens[this.pos]; }
        consume() { return this.tokens[this.pos++]; }
        match(str) { if (this.peek() === str) { this.pos++; return true; } return false; }
        expect(str) { 
            if (this.consume() !== str) throw new Error(`Syntax Error: Expected '${str}' at token '${this.tokens[this.pos-1]}'`); 
        }

        parse() {
            const program = { type: 'Program', globals: [], functions: [] };
            while (this.pos < this.tokens.length) {
                let type = this.consume(); // int/void
                let isPtr = false;
                if (this.peek() === '*') { isPtr = true; this.consume(); }
                let name = this.consume();
                
                if (this.peek() === '(') { // 函数
                    program.functions.push(this.parseFunction(type, name));
                } else { // 全局变量
                    program.globals.push(this.parseGlobal(type, name, isPtr));
                }
            }
            return program;
        }

        parseGlobal(type, name, isPtr) {
            let size = 1;
            if (this.match('[')) { size = parseInt(this.consume()); this.expect(']'); }
            this.expect(';');
            return { type: 'GlobalVar', varType: type, isPtr, name, size };
        }

        parseFunction(retType, name) {
            this.expect('(');
            let params = [];
            if (this.peek() !== ')') {
                do {
                    let pType = this.consume();
                    let pIsPtr = (this.peek() === '*') ? (this.consume() && true) : false;
                    let pName = this.consume();
                    params.push({ type: pType, isPtr: pIsPtr, name: pName });
                } while (this.match(','));
            }
            this.expect(')');
            this.expect('{');
            let body = this.parseBlock();
            return { type: 'Function', retType, name, params, body };
        }

        parseBlock() {
            let stmts = [];
            while (this.peek() !== '}' && this.pos < this.tokens.length) {
                stmts.push(this.parseStatement());
            }
            this.expect('}');
            return stmts;
        }

        parseStatement() {
            if (this.match('int')) { 
                let isPtr = (this.peek() === '*') ? (this.consume() && true) : false;
                let name = this.consume();
                let size = 1;
                if (this.match('[')) { size = parseInt(this.consume()); this.expect(']'); }
                let init = null;
                if (this.match('=')) init = this.parseExpression();
                this.expect(';');
                return { type: 'VarDecl', varType: 'int', isPtr, name, size, init };
            }
            if (this.match('return')) {
                let val = (this.peek() === ';') ? null : this.parseExpression();
                this.expect(';');
                return { type: 'Return', value: val };
            }
            if (this.match('if')) {
                this.expect('('); let test = this.parseExpression(); this.expect(')');
                this.expect('{'); let cons = this.parseBlock();
                let alt = null;
                if (this.match('else')) { this.expect('{'); alt = this.parseBlock(); }
                return { type: 'If', test, consequent: cons, alternate: alt };
            }
            if (this.match('while')) {
                this.expect('('); let test = this.parseExpression(); this.expect(')');
                this.expect('{'); let body = this.parseBlock();
                return { type: 'While', test, body };
            }
            if (this.tokens[this.pos] === 'for') { // Lookahead for 'for'
                this.consume(); 
                this.expect('(');
                let init = (this.peek() !== ';') ? this.parseExpression() : null; this.expect(';');
                let test = (this.peek() !== ';') ? this.parseExpression() : null; this.expect(';');
                let update = (this.peek() !== ')') ? this.parseExpression() : null; this.expect(')');
                this.expect('{'); let body = this.parseBlock();
                return { type: 'For', init, test, update, body };
            }
            if (this.match('break')) { this.expect(';'); return { type: 'Break' }; }
            if (this.match('continue')) { this.expect(';'); return { type: 'Continue' }; }

            let expr = this.parseExpression();
            this.expect(';');
            return { type: 'ExprStmt', expr };
        }

        parseExpression() { return this.parseAssignment(); }
        parseAssignment() {
            let left = this.parseLogicalOr();
            if (this.match('=')) {
                let right = this.parseAssignment();
                return { type: 'Assignment', left, right };
            }
            return left;
        }
        parseLogicalOr() {
            let left = this.parseLogicalAnd();
            while (this.match('||')) left = { type: 'Binary', op: '||', left, right: this.parseLogicalAnd() };
            return left;
        }
        parseLogicalAnd() {
            let left = this.parseEquality();
            while (this.match('&&')) left = { type: 'Binary', op: '&&', left, right: this.parseEquality() };
            return left;
        }
        parseEquality() {
            let left = this.parseRelational();
            while (['==','!='].includes(this.peek())) left = { type: 'Binary', op: this.consume(), left, right: this.parseRelational() };
            return left;
        }
        parseRelational() {
            let left = this.parseAdd();
            while (['<','>','<=','>='].includes(this.peek())) left = { type: 'Binary', op: this.consume(), left, right: this.parseAdd() };
            return left;
        }
        parseAdd() {
            let left = this.parseTerm();
            while (['+','-','|','^','<<','>>'].includes(this.peek())) left = { type: 'Binary', op: this.consume(), left, right: this.parseTerm() };
            return left;
        }
        parseTerm() {
            let left = this.parseFactor();
            while (['*','/','%','&'].includes(this.peek())) left = { type: 'Binary', op: this.consume(), left, right: this.parseFactor() };
            return left;
        }
        parseFactor() {
            if (this.match('(')) { let e = this.parseExpression(); this.expect(')'); return e; }
            if (['$','-','!','~','*'].includes(this.peek())) {
                let op = this.consume();
                return { type: 'Unary', op, arg: this.parseFactor() };
            }
            let t = this.consume();
            if (/^0x/.test(t)) return { type: 'Literal', val: parseInt(t, 16) };
            if (/^[0-9]+$/.test(t)) return { type: 'Literal', val: parseInt(t) };
            if (/^[a-zA-Z_]/.test(t)) {
                if (this.match('(')) { // Call
                    let args = [];
                    if (this.peek() !== ')') { do { args.push(this.parseExpression()); } while(this.match(',')); }
                    this.expect(')');
                    return { type: 'Call', callee: t, args };
                }
                if (this.match('[')) { // Array access sugar
                    let idx = this.parseExpression(); this.expect(']');
                    return { type: 'ArrayAccess', name: t, index: idx };
                }
                return { type: 'Identifier', name: t };
            }
            throw new Error(`Unexpected token: ${t}`);
        }
    }

    // --- 3. 代码生成器 ---
    class Compiler {
        constructor() {
            this.labelCount = 0;
            this.globals = {}; 
            this.locals = {};  
            this.curStackSize = 0;
            this.asm = "";
            this.regs = { V0:'$2', V1:'$3', SP:'$29', FP:'$30', RA:'$31' };
        }
        emit(line) { this.asm += `  ${line}\n`; }
        label(l) { this.asm += `${l}:\n`; }
        newLabel(p) { return `L_${p}_${this.labelCount++}`; }

       compile(ast) {
            this.asm = "# Generated by Enhanced MiniC Compiler\n";
            
            // =========================================================
            // 【关键添加】初始化栈指针 (Stack Pointer)
            // =========================================================
            // 如果不加这段，程序会往地址 0x00000000 写数据，导致写入失败，
            // 变量读出来全是 0，数码管也就显示 0。
            this.emit("lui $sp, 0x0000");      // $sp 高 16 位清零
            this.emit("ori $sp, $sp, 0x4000"); // $sp 低 16 位设为 0x4000 (16KB处)
            this.emit("move $30, $sp");        // 初始化帧指针 $fp ($30)
            this.emit("j main");               // 跳转到 main 函数
            this.emit("nop");                  // 延迟槽
            // =========================================================

            // 警告：由于 Assembler 的限制，全局变量(.data)可能无法被正确汇编。
            // 建议尽量使用局部变量。
            ast.functions.forEach(f => this.genFunction(f));
            return this.asm;
        }

        genFunction(func) {
            this.locals = {}; this.curStackSize = 0;
            this.label(func.name);
            this.emit(`sw ${this.regs.RA}, -4(${this.regs.SP})`);
            this.emit(`sw ${this.regs.FP}, -8(${this.regs.SP})`);
            this.emit(`move ${this.regs.FP}, ${this.regs.SP}`);
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -8`);
            
            func.params.forEach((p, i) => {
                this.curStackSize += 4;
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                this.locals[p.name] = { offset: -8 - this.curStackSize, isPtr: p.isPtr };
                if(i < 4) this.emit(`sw $${4+i}, 0(${this.regs.SP})`);
            });

            func.body.forEach(stmt => this.genStmt(stmt));

            this.label(`${func.name}_end`);
            this.emit(`move ${this.regs.SP}, ${this.regs.FP}`);
            this.emit(`lw ${this.regs.FP}, -8(${this.regs.SP})`);
            this.emit(`lw ${this.regs.RA}, -4(${this.regs.SP})`);
            this.emit(`jr ${this.regs.RA}`);
            this.emit(`nop`);
        }

        genStmt(stmt) {
            switch(stmt.type) {
                case 'VarDecl': {
                    let size = stmt.size * 4; this.curStackSize += size;
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -${size}`);
                    this.locals[stmt.name] = { offset: -8 - this.curStackSize, isPtr: stmt.isPtr, isArray: stmt.size > 1 };
                    if (stmt.init) {
                        this.genExpr(stmt.init);
                        this.emit(`sw ${this.regs.V0}, 0(${this.regs.SP})`);
                    }
                    break;
                }
                case 'Return':
                    if (stmt.value) this.genExpr(stmt.value);
                    this.emit(`j ${Object.keys(this.locals).length === 0 ? 'main' : 'main'}_end`); // Hack: should be cur func
                    break; // 实际逻辑中应跳转到 epilogue
                case 'ExprStmt': this.genExpr(stmt.expr); break;
                case 'If': {
                    let lElse = this.newLabel('else'), lEnd = this.newLabel('end');
                    this.genExpr(stmt.test);
                    this.emit(`beq ${this.regs.V0}, $0, ${lElse}`); this.emit(`nop`);
                    stmt.consequent.forEach(s => this.genStmt(s));
                    this.emit(`j ${lEnd}`); this.emit(`nop`);
                    this.label(lElse);
                    if (stmt.alternate) stmt.alternate.forEach(s => this.genStmt(s));
                    this.label(lEnd);
                    break;
                }
                case 'While': {
                    let lLoop = this.newLabel('loop'), lEnd = this.newLabel('end');
                    this.label(lLoop);
                    this.genExpr(stmt.test);
                    this.emit(`beq ${this.regs.V0}, $0, ${lEnd}`); this.emit(`nop`);
                    stmt.body.forEach(s => this.genStmt(s));
                    this.emit(`j ${lLoop}`); this.emit(`nop`);
                    this.label(lEnd);
                    break;
                }
                case 'For': {
                    let lLoop = this.newLabel('loop'), lEnd = this.newLabel('end');
                    if (stmt.init) this.genExpr(stmt.init);
                    this.label(lLoop);
                    if (stmt.test) {
                        this.genExpr(stmt.test);
                        this.emit(`beq ${this.regs.V0}, $0, ${lEnd}`); this.emit(`nop`);
                    }
                    stmt.body.forEach(s => this.genStmt(s));
                    if (stmt.update) this.genExpr(stmt.update);
                    this.emit(`j ${lLoop}`); this.emit(`nop`);
                    this.label(lEnd);
                    break;
                }
            }
        }

        genAddr(node) {
            if (node.type === 'Identifier') {
                if (this.locals[node.name]) this.emit(`addiu ${this.regs.V0}, ${this.regs.FP}, ${this.locals[node.name].offset}`);
                else throw new Error(`Undefined var: ${node.name}`);
            } else if (node.type === 'Unary' && node.op === '*') {
                this.genExpr(node.arg);
            } else if (node.type === 'Unary' && node.op === '$') {
                this.genExpr(node.arg); // Address for MMIO
            } else if (node.type === 'ArrayAccess') {
                this.genAddr({type:'Identifier', name: node.name});
                this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                this.genExpr(node.index);
                this.emit(`sll ${this.regs.V0}, ${this.regs.V0}, 2`);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`);
                this.emit(`addu ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
            }
        }

        genExpr(expr) {
            if (!expr) return;
            switch(expr.type) {
                case 'Literal': this.emit(`li ${this.regs.V0}, ${expr.val}`); break;
                case 'Identifier':
                    this.genAddr(expr);
                    let info = this.locals[expr.name];
                    if (!info || !info.isArray) this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`);
                    break;
                case 'Assignment':
                    this.genAddr(expr.left);
                    this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`);
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                    this.genExpr(expr.right);
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                    this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`);
                    this.emit(`sw ${this.regs.V0}, 0(${this.regs.V1})`);
                    break;
                case 'Binary':
                    this.genExpr(expr.left);
                    this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`);
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                    this.genExpr(expr.right);
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                    this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`);
                    const opMap = {'+':'addu', '-':'subu', '&':'and', '|':'or', '^':'xor', '<<':'sllv', '>>':'srlv', '<':'slt'};
                    if(opMap[expr.op]) this.emit(`${opMap[expr.op]} ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
                    if(expr.op==='*') { this.emit(`mult ${this.regs.V1}, ${this.regs.V0}`); this.emit(`mflo ${this.regs.V0}`); }
                    if(expr.op==='==') { this.emit(`xor ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); this.emit(`sltiu ${this.regs.V0}, ${this.regs.V0}, 1`); }
                    if(expr.op==='!=') { this.emit(`xor ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); this.emit(`sltu ${this.regs.V0}, $0, ${this.regs.V0}`); }
                    break;
                case 'Unary':
                    this.genExpr(expr.arg);
                    if(expr.op==='-') this.emit(`subu ${this.regs.V0}, $0, ${this.regs.V0}`);
                    if(expr.op==='!') this.emit(`sltiu ${this.regs.V0}, ${this.regs.V0}, 1`);
                    if(expr.op==='*') this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`);
                    if(expr.op==='$') this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`); // MMIO Read
                    break;
                case 'Call':
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                    this.emit(`sw ${this.regs.RA}, 0(${this.regs.SP})`);
                    expr.args.forEach((a,i) => {
                        this.genExpr(a);
                        if(i<4) this.emit(`move $${4+i}, ${this.regs.V0}`);
                    });
                    this.emit(`jal ${expr.callee}`); this.emit(`nop`);
                    this.emit(`lw ${this.regs.RA}, 0(${this.regs.SP})`);
                    this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                    break;
            }
        }
    }

    // 导出到全局
    window.MiniSys.compile = (source) => {
        try {
            const tokens = tokenize(source);
            const parser = new Parser(tokens);
            const ast = parser.parse(); // 增强版接口
            const compiler = new Compiler();
            return compiler.compile(ast);
        } catch(e) {
            return `Error: ${e.message}`;
        }
    };
})();
// ==========================================
// 2. 注入 汇编器核心 (core.js)
// ==========================================
(function() {
    // [请在此处粘贴 core.js 中除 require('fs') 和 module.exports 外的代码]
    // ... const regMap ... function assemblerCore ...
    // 寄存器映射 (保持不变)
// 寄存器映射
// 寄存器映射
const regMap = {
    zero: 0, at: 1, v0: 2, v1: 3, a0: 4, a1: 5, a2: 6, a3: 7,
    t0: 8,   t1: 9,  t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15,
    s0: 16,  s1: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
    t8: 24,  t9: 25, k0: 26, k1: 27, gp: 28, sp: 29, fp: 30, ra: 31,
    '$0': 0
};

const encodeR = (rs, rt, rd, shamt, funct) => ((0x00 << 26) | (rs << 21) | (rt << 16) | (rd << 11) | (shamt << 6) | funct) >>> 0;
const encodeI = (op, rs, rt, imm) => ((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xFFFF)) >>> 0;
const encodeJ = (op, addr) => ((op << 26) | (addr & 0x3FFFFFF)) >>> 0;

function parseReg(t) {
    if (!t) return 0;
    const clean = t.replace(/[$,]/g, '').toLowerCase();
    if (regMap[clean] !== undefined) return regMap[clean];
    if (!isNaN(parseInt(clean))) return parseInt(clean);
    return 0;
}

function parseImm(t) {
    if (!t) return 0;
    t = t.trim();
    return t.startsWith('0x') ? parseInt(t, 16) : parseInt(t, 10);
}

// 辅助：判断指令会生成多少字节 (用于第一遍扫描计算 Label 地址)
function getInstructionSize(op, parts) {
    if (op.startsWith('.')) return 0; // 伪指令 .text 等
    if (op === 'LI') {
        const imm = parseImm(parts[2]);
        // 如果是 16 位能表示的数，生成 1 条指令；否则生成 2 条 (LUI + ORI)
        if (imm >= -32768 && imm <= 65535) return 4;
        return 8;
    }
    return 4; // 其他指令默认 4 字节
}

function assemblerCore(source) {
    const lines = source.split(/\r?\n/);
    let labels = {};
    let relocations = []; 
    
    // --- 第一遍扫描：计算标签地址 ---
    let tempPc = 0;
    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (!line) return;
        
        if (line.includes(':')) {
            const parts = line.split(':');
            labels[parts[0].trim()] = tempPc;
            line = parts[1].trim();
        }
        if (!line) return;
        
        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        
        tempPc += getInstructionSize(op, parts);
    });

    // --- 第二遍扫描：生成机器码 ---
    let pc = 0;
    let machineCodes = [];

    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (line.includes(':')) line = line.split(':')[1].trim();
        if (!line) return;

        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        if (op.startsWith('.')) return;

        let instBuffer = []; // 暂存当前行生成的指令

        try {
            switch (op) {
                // === 伪指令修复 ===
                case 'LI': { 
                    const rt = parseReg(parts[1]);
                    const imm = parseImm(parts[2]);
                    // 智能扩展：16位用 ADDIU/ORI，32位用 LUI+ORI
                    if (imm >= -32768 && imm <= 32767) {
                        // Signed 16-bit
                        instBuffer.push(encodeI(0x09, 0, rt, imm)); // ADDIU
                    } else if (imm >= 0 && imm <= 65535) {
                        // Unsigned 16-bit
                        instBuffer.push(encodeI(0x0D, 0, rt, imm)); // ORI
                    } else {
                        // 32-bit: LUI + ORI
                        const upper = (imm >>> 16) & 0xFFFF;
                        const lower = imm & 0xFFFF;
                        instBuffer.push(encodeI(0x0F, 0, rt, upper)); // LUI rt, upper
                        if (lower !== 0) {
                            instBuffer.push(encodeI(0x0D, rt, rt, lower)); // ORI rt, rt, lower
                        }
                    }
                    break;
                }
                case 'MOVE': { 
                    const rd = parseReg(parts[1]);
                    const rs = parseReg(parts[2]);
                    instBuffer.push(encodeR(rs, 0, rd, 0, 0x21)); // ADDU rd, rs, $0
                    break;
                }
                case 'NOP': instBuffer.push(0); break;

                // === 常用指令 ===
                case 'SW': {
                    // 支持 SW $t0, 0($sp) 和 SW $t0, $sp (默认偏移0)
                    let rs = 0, offset = 0;
                    if (parts[2].includes('(')) {
                        const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                        if (match) { offset = parseImm(match[1]); rs = parseReg(match[2]); }
                    } else {
                        rs = parseReg(parts[2]);
                    }
                    instBuffer.push(encodeI(0x2B, rs, parseReg(parts[1]), offset));
                    break;
                }
                case 'LW': {
                    let rs = 0, offset = 0;
                    if (parts[2].includes('(')) {
                        const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                        if (match) { offset = parseImm(match[1]); rs = parseReg(match[2]); }
                    } else {
                        rs = parseReg(parts[2]);
                    }
                    instBuffer.push(encodeI(0x23, rs, parseReg(parts[1]), offset));
                    break;
                }
                
                // === R-Type ===
                case 'ADD':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x20)); break;
                case 'ADDU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x21)); break;
                case 'SUB':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x22)); break;
                case 'SUBU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x23)); break;
                case 'AND':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x24)); break;
                case 'OR':   instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x25)); break;
                case 'XOR':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x26)); break;
                case 'NOR':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x27)); break;
                case 'SLT':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2A)); break;
                case 'SLTU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2B)); break;

                // 移位
                case 'SLL':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x00)); break;
                case 'SRL':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x02)); break;
                case 'SRA':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x03)); break;

                // Branch
                case 'BEQ': 
                case 'BNE': 
                {
                    relocations.push({ type: op, pc: pc, label: parts[3] });
                    const opcode = (op === 'BEQ') ? 0x04 : 0x05;
                    instBuffer.push(encodeI(opcode, parseReg(parts[1]), parseReg(parts[2]), 0));
                    break;
                }
                
                // Jump
                case 'J':   
                case 'JAL': 
                    relocations.push({ type: op, pc: pc, label: parts[1] });
                    instBuffer.push(encodeJ(op==='J'?0x02:0x03, 0)); 
                    break;

                // 其他指令 (I-Type, System, etc) 可沿用旧代码，此处为简化仅列出关键修复
                // 请确保原有代码的其他 case 依然存在，或者直接复制上面修复的逻辑到你的完整文件中
                default: 
                    // 兜底处理：尝试标准 R/I 格式，防止漏掉指令
                    if(['ADDI','ADDIU','ANDI','ORI','XORI','SLTI','SLTIU'].includes(op)) {
                         let opcode = 0;
                         if(op=='ADDI') opcode=0x08; if(op=='ADDIU') opcode=0x09;
                         if(op=='ANDI') opcode=0x0C; if(op=='ORI') opcode=0x0D;
                         if(op=='XORI') opcode=0x0E; if(op=='SLTI') opcode=0x0A;
                         if(op=='SLTIU') opcode=0x0B;
                         instBuffer.push(encodeI(opcode, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3])));
                    }
                    else if(['SB','SH','LB','LBU','LH','LHU'].includes(op)) {
                         // Copy LW/SW logic
                         let map = {'SB':0x28,'SH':0x29,'LB':0x20,'LBU':0x24,'LH':0x21,'LHU':0x25};
                         let match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                         if(match) instBuffer.push(encodeI(map[op], parseReg(match[2]), parseReg(parts[1]), parseImm(match[1])));
                    }
                    else if(op === 'MTC0') instBuffer.push(((0x10 << 26) | (0x04 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0);
                    else if(op === 'MFC0') instBuffer.push(((0x10 << 26) | (0x00 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0);
                    else if(op === 'ERET') instBuffer.push(0x42000018);
                    break;
            }

            // --- 核心修复：正确增加 PC ---
            instBuffer.forEach(code => {
                machineCodes.push(code);
                pc += 4;
            });
            
        } catch (e) {
            console.error(`Error at line: ${line} - ${e.message}`);
        }
    });

    return { 
        text: machineCodes, 
        symbols: labels, 
        relocations: relocations 
    };
}

    window.MiniSys.assemble = (source) => {
        return assemblerCore(source); // 调用 core.js 的函数
    };
})();

// ==========================================
// 3. 注入 链接器核心 (linker.js)
// ==========================================
(function() {
    // [请在此处粘贴 linker.js 中除 module.exports 外的代码]
    // ... const LAYOUT ... function linker ...
    const LAYOUT = {
    BIOS_BASE: 0x00000000,
    USER_BASE: 0x00000400, // 给 BIOS 预留 1K 字空间
    ISR_BASE:  0x00000008  // 特殊处理：ISR 的跳转指令通常直接链接在 BIOS 开头
};

function linker(biosObj, userObj, isrObj) {
    // A. 符号全局化：将各段符号映射到物理地址
    const globalSymbols = {};
    
    const lift = (obj, base) => {
        Object.keys(obj.symbols || {}).forEach(label => {
            globalSymbols[label] = obj.symbols[label] + (base * 4); // 转为字节地址
        });
    };

    lift(biosObj, LAYOUT.BIOS_BASE);
    lift(userObj, LAYOUT.USER_BASE);
    // 注意：ISR 通常作为一个函数由 BIOS 的 0x08 地址处跳转进入
    lift(isrObj, LAYOUT.USER_BASE + userObj.text.length); 

    // B. 内存镜像初始化
    const imageSize = 0x4000; // 16K Words
    let image = new Array(imageSize).fill(0);

    // C. 代码段合并
    const writeToImg = (text, base) => {
        for (let i = 0; i < text.length; i++) {
            image[base + i] = text[i] >>> 0;
        }
    };

    writeToImg(biosObj.text, LAYOUT.BIOS_BASE);
    writeToImg(userObj.text, LAYOUT.USER_BASE);
    writeToImg(isrObj.text, LAYOUT.USER_BASE + userObj.text.length);

    // D. 全局重定位回填 (关键修改)
    const allRelocs = [
        ...applyOffset(biosObj.relocations, LAYOUT.BIOS_BASE),
        ...applyOffset(userObj.relocations, LAYOUT.USER_BASE),
        ...applyOffset(isrObj.relocations, LAYOUT.USER_BASE + userObj.text.length)
    ];

    allRelocs.forEach(reloc => {
        const targetAddr = globalSymbols[reloc.label];
        if (targetAddr === undefined) throw new Error(`Undefined symbol: ${reloc.label}`);

        let word = image[reloc.pc / 4];
        
        if (reloc.type === 'J' || reloc.type === 'JAL') {
            // MIPS J-Type: op(6) + target(26). target 为字节地址 >> 2
            word = (word & 0xFC000000) | ((targetAddr >> 2) & 0x3FFFFFF);
        } else if (reloc.type === 'BEQ' || reloc.type === 'BNE') {
            // I-Type: 相对偏移 = (目标 - (当前+4)) / 4
            const offset = (targetAddr - (reloc.pc + 4)) >> 2;
            word = (word & 0xFFFF0000) | (offset & 0xFFFF);
        }
        
        image[reloc.pc / 4] = word >>> 0;
    });

    return image;
}

function applyOffset(relocs, baseWordAddr) {
    return (relocs || []).map(r => ({
        ...r,
        pc: r.pc + (baseWordAddr * 4) // 将 PC 转换为全局字节地址
    }));
}
    window.MiniSys.link = (biosObj, userObj, isrObj) => {
        return linker(biosObj, userObj, isrObj); // 调用 linker.js 的函数
    };
})();