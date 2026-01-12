/**
 * MiniC Compiler - Enhanced Version (Modified for Standard Minisys Compatibility)
 * 修改说明：
 * 1. 参照标准版 ASMGenerator.ts，在所有 lw 指令后增加 2 个 nop，解决 Load-Use 流水线冒险。
 * 2. 保持了原有的 .data 段和栈帧结构。
 */

// ==========================================
// 1. 词法分析器 (Tokenizer)
// ==========================================
function tokenize(source) {
    // 移除注释
    source = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 增强的正则：支持 <=, >=, ==, !=, &&, ||
    const regex = /\s*(0x[0-9a-fA-F]+|[0-9]+|int|void|return|if|else|while|for|break|continue|\$|[a-zA-Z_][a-zA-Z0-9_]*|<=|>=|==|!=|&&|\|\||[+\-*/%&|^<>=!~,;*(){}\[\]])\s*/g;
    
    let tokens = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
        if (match[1]) tokens.push(match[1]);
    }
    return tokens;
}

// ==========================================
// 2. 语法分析器 (Parser - 生成 AST)
// ==========================================
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
            
            if (this.peek() === '(') {
                program.functions.push(this.parseFunction(type, name));
            } else {
                program.globals.push(this.parseGlobal(type, name, isPtr));
            }
        }
        return program;
    }

    parseGlobal(type, name, isPtr) {
        let size = 1;
        if (this.match('[')) {
            size = parseInt(this.consume());
            this.expect(']');
        }
        this.expect(';');
        return { type: 'GlobalVar', varType: type, isPtr, name, size };
    }

    parseFunction(retType, name) {
        this.expect('(');
        let params = [];
        if (this.peek() !== ')') {
            do {
                let pType = this.consume();
                let pIsPtr = false;
                if (this.peek() === '*') { pIsPtr = true; this.consume(); }
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
            let isPtr = false;
            if (this.peek() === '*') { isPtr = true; this.consume(); }
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
        // For loop parsing
        if (this.tokens[this.pos] === 'for') {
             // Just consume it if matched above or handle here if logic differs
        }
        if (this.match('for')) {
            this.expect('(');
            let init = null;
            if (this.peek() !== ';') init = this.parseExpression(); 
            this.expect(';');
            let test = null;
            if (this.peek() !== ';') test = this.parseExpression();
            this.expect(';');
            let update = null;
            if (this.peek() !== ')') update = this.parseExpression();
            this.expect(')');
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
        while (['==','!='].includes(this.peek())) 
            left = { type: 'Binary', op: this.consume(), left, right: this.parseRelational() };
        return left;
    }
    parseRelational() {
        let left = this.parseAdd();
        while (['<','>','<=','>='].includes(this.peek())) 
            left = { type: 'Binary', op: this.consume(), left, right: this.parseAdd() };
        return left;
    }
    parseAdd() {
        let left = this.parseTerm();
        while (['+','-','|','^','<<','>>'].includes(this.peek())) 
            left = { type: 'Binary', op: this.consume(), left, right: this.parseTerm() };
        return left;
    }
    parseTerm() {
        let left = this.parseFactor();
        while (['*','/','%','&'].includes(this.peek())) 
            left = { type: 'Binary', op: this.consume(), left, right: this.parseFactor() };
        return left;
    }
    parseFactor() {
        if (this.match('(')) { let e = this.parseExpression(); this.expect(')'); return e; }
        if (['$','-','!','~','*','&'].includes(this.peek())) {
            let op = this.consume();
            return { type: 'Unary', op, arg: this.parseFactor() };
        }
        
        let t = this.consume();
        if (/^0x/.test(t)) return { type: 'Literal', val: parseInt(t, 16) };
        if (/^[0-9]+$/.test(t)) return { type: 'Literal', val: parseInt(t) };
        
        if (/^[a-zA-Z_]/.test(t)) {
            if (this.match('(')) {
                let args = [];
                if (this.peek() !== ')') {
                    do { args.push(this.parseExpression()); } while(this.match(','));
                }
                this.expect(')');
                return { type: 'Call', callee: t, args };
            }
            if (this.match('[')) {
                let index = this.parseExpression();
                this.expect(']');
                return { type: 'ArrayAccess', name: t, index };
            }
            return { type: 'Identifier', name: t };
        }
        throw new Error(`Unexpected token: ${t}`);
    }
}

// ==========================================
// 3. 代码生成器 (Compiler)
// ==========================================
class Compiler {
    constructor() {
        this.labelCount = 0;
        this.globals = {}; 
        this.locals = {};  
        this.curStackSize = 0;
        this.asm = "";
        this.regs = { V0:'$2', V1:'$3', A0:'$4', A1:'$5', A2:'$6', A3:'$7', SP:'$29', FP:'$30', RA:'$31' };
    }

    emit(line) { this.asm += `  ${line}\n`; }
    
    // [修正] 标准版中 loadVar 之后会有 nop nop，这里封装一个 emitLoad 来统一处理
    emitLoad(reg, offset, base) {
        this.emit(`lw ${reg}, ${offset}(${base})`);
        this.emit(`nop`); // Delay Slot 1
        this.emit(`nop`); // Delay Slot 2
    }

    label(l) { this.asm += `${l}:\n`; }
    newLabel(p) { return `L_${p}_${this.labelCount++}`; }

    compile(ast) {
        this.asm = "# Generated by Enhanced MiniC Compiler (Standard Compliant)\n";
        
        if (ast.globals.length > 0) {
            this.asm += ".data\n";
            ast.globals.forEach(g => {
                this.globals[g.name] = { type: 'global', size: g.size };
                this.label(`G_${g.name}`);
                for(let i=0; i<g.size; i++) this.emit(".word 0");
            });
            this.asm += ".text\n";
        }

        ast.functions.forEach(f => this.genFunction(f));
        return this.asm;
    }

    genFunction(func) {
        this.locals = {};
        this.curStackSize = 0;

        this.label(func.name);
        
        this.emit(`sw ${this.regs.RA}, -4(${this.regs.SP})`);
        this.emit(`sw ${this.regs.FP}, -8(${this.regs.SP})`);
        this.emit(`move ${this.regs.FP}, ${this.regs.SP}`);
        this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -8`); 
        
        func.params.forEach((p, i) => {
            this.curStackSize += 4;
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
            let offset = -8 - this.curStackSize; 
            this.locals[p.name] = { offset, isPtr: p.isPtr };
            if(i < 4) this.emit(`sw $${4+i}, 0(${this.regs.SP})`);
        });

        func.body.forEach(stmt => this.genStmt(stmt));

        this.label(`${func.name}_end`);
        this.emit(`move ${this.regs.SP}, ${this.regs.FP}`);
        // [修正] 使用 emitLoad
        this.emitLoad(this.regs.FP, -8, this.regs.SP);
        this.emitLoad(this.regs.RA, -4, this.regs.SP);
        this.emit(`jr ${this.regs.RA}`);
        this.emit(`nop`);
    }

    genStmt(stmt) {
        switch(stmt.type) {
            case 'VarDecl':
                let size = stmt.size * 4;
                this.curStackSize += size;
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -${size}`);
                let offset = -8 - this.curStackSize;
                this.locals[stmt.name] = { offset, isPtr: stmt.isPtr, isArray: stmt.size > 1 };
                
                if (stmt.init) {
                    this.genExpr(stmt.init); 
                    this.emit(`sw ${this.regs.V0}, 0(${this.regs.SP})`);
                }
                break;
            case 'Return':
                if (stmt.value) this.genExpr(stmt.value);
                this.emit(`move ${this.regs.SP}, ${this.regs.FP}`);
                // [修正] 使用 emitLoad
                this.emitLoad(this.regs.FP, -8, this.regs.SP);
                this.emitLoad(this.regs.RA, -4, this.regs.SP);
                this.emit(`jr ${this.regs.RA}`);
                this.emit(`nop`);
                break;
            case 'ExprStmt':
                this.genExpr(stmt.expr);
                break;
            case 'If': {
                let lElse = this.newLabel('else');
                let lEnd = this.newLabel('end');
                this.genExpr(stmt.test);
                this.emit(`beq ${this.regs.V0}, $0, ${lElse}`);
                this.emit(`nop`);
                stmt.consequent.forEach(s => this.genStmt(s));
                this.emit(`j ${lEnd}`);
                this.emit(`nop`);
                this.label(lElse);
                if (stmt.alternate) stmt.alternate.forEach(s => this.genStmt(s));
                this.label(lEnd);
                break;
            }
            case 'While': {
                let lLoop = this.newLabel('loop');
                let lEnd = this.newLabel('end');
                this.label(lLoop);
                this.genExpr(stmt.test);
                this.emit(`beq ${this.regs.V0}, $0, ${lEnd}`);
                this.emit(`nop`);
                stmt.body.forEach(s => this.genStmt(s));
                this.emit(`j ${lLoop}`);
                this.emit(`nop`);
                this.label(lEnd);
                break;
            }
            case 'For': {
                let lLoop = this.newLabel('loop');
                let lEnd = this.newLabel('end');
                if (stmt.init) this.genExpr(stmt.init);
                this.label(lLoop);
                if (stmt.test) {
                    this.genExpr(stmt.test);
                    this.emit(`beq ${this.regs.V0}, $0, ${lEnd}`);
                    this.emit(`nop`);
                }
                stmt.body.forEach(s => this.genStmt(s));
                if (stmt.update) this.genExpr(stmt.update);
                this.emit(`j ${lLoop}`);
                this.emit(`nop`);
                this.label(lEnd);
                break;
            }
        }
    }

    genAddr(node) {
        if (node.type === 'Identifier') {
            let name = node.name;
            if (this.locals[name]) {
                this.emit(`addiu ${this.regs.V0}, ${this.regs.FP}, ${this.locals[name].offset}`);
            } else if (this.globals[name]) {
                this.emit(`la ${this.regs.V0}, G_${name}`);
            } else {
                throw new Error(`Undefined variable: ${name}`);
            }
        } else if (node.type === 'Unary' && node.op === '*') {
            this.genExpr(node.arg);
        } else if (node.type === 'Unary' && node.op === '$') {
            this.genExpr(node.arg);
        } else if (node.type === 'ArrayAccess') {
            this.genAddr({type: 'Identifier', name: node.name}); 
            this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`); 
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
            
            this.genExpr(node.index); 
            this.emit(`sll ${this.regs.V0}, ${this.regs.V0}, 2`); 
            
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
            // [修正] 使用 emitLoad (Pop 操作)
            this.emitLoad(this.regs.V1, -4, this.regs.SP); 
            this.emit(`addu ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
        } else {
            throw new Error(`Cannot assign to ${node.type}`);
        }
    }

    genExpr(expr) {
        if (!expr) return;
        switch(expr.type) {
            case 'Literal':
                this.emit(`li ${this.regs.V0}, ${expr.val}`);
                break;
            case 'Identifier':
                this.genAddr(expr); 
                let info = this.locals[expr.name] || this.globals[expr.name];
                if (!info.isArray) {
                    // [修正] 使用 emitLoad
                    this.emitLoad(this.regs.V0, 0, this.regs.V0);
                }
                break;
            case 'ArrayAccess':
                this.genAddr(expr);
                // [修正] 使用 emitLoad
                this.emitLoad(this.regs.V0, 0, this.regs.V0);
                break;
            case 'Assignment':
                this.genAddr(expr.left);
                this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                
                this.genExpr(expr.right); 
                
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                // [修正] 使用 emitLoad
                this.emitLoad(this.regs.V1, -4, this.regs.SP);
                this.emit(`sw ${this.regs.V0}, 0(${this.regs.V1})`);
                break;
            case 'Binary':
                this.genExpr(expr.left);
                this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                
                this.genExpr(expr.right); 
                
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                // [修正] 使用 emitLoad
                this.emitLoad(this.regs.V1, -4, this.regs.SP);
                
                switch(expr.op) {
                    case '+': this.emit(`addu ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '-': this.emit(`subu ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '*': this.emit(`mult ${this.regs.V1}, ${this.regs.V0}`); this.emit(`mflo ${this.regs.V0}`); break;
                    case '/': this.emit(`div ${this.regs.V1}, ${this.regs.V0}`); this.emit(`mflo ${this.regs.V0}`); break;
                    case '%': this.emit(`div ${this.regs.V1}, ${this.regs.V0}`); this.emit(`mfhi ${this.regs.V0}`); break;
                    case '&': this.emit(`and ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '|': this.emit(`or ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '^': this.emit(`xor ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '<<': this.emit(`sllv ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '>>': this.emit(`srlv ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '<': this.emit(`slt ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`); break;
                    case '>': this.emit(`slt ${this.regs.V0}, ${this.regs.V0}, ${this.regs.V1}`); break;
                    case '<=': 
                        this.emit(`slt ${this.regs.V0}, ${this.regs.V0}, ${this.regs.V1}`); 
                        this.emit(`xori ${this.regs.V0}, ${this.regs.V0}, 1`);
                        break;
                    case '>=': 
                        this.emit(`slt ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
                        this.emit(`xori ${this.regs.V0}, ${this.regs.V0}, 1`);
                        break;
                    case '==': 
                        this.emit(`xor ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
                        this.emit(`sltiu ${this.regs.V0}, ${this.regs.V0}, 1`);
                        break;
                    case '!=':
                        this.emit(`xor ${this.regs.V0}, ${this.regs.V1}, ${this.regs.V0}`);
                        this.emit(`sltu ${this.regs.V0}, $0, ${this.regs.V0}`);
                        break;
                }
                break;
            case 'Unary':
                this.genExpr(expr.arg); 
                if (expr.op === '-') this.emit(`subu ${this.regs.V0}, $0, ${this.regs.V0}`);
                if (expr.op === '!') this.emit(`sltiu ${this.regs.V0}, ${this.regs.V0}, 1`);
                if (expr.op === '~') this.emit(`nor ${this.regs.V0}, ${this.regs.V0}, $0`);
                // [修正] 使用 emitLoad
                if (expr.op === '*') this.emitLoad(this.regs.V0, 0, this.regs.V0);
                if (expr.op === '&') { }
                // [修正] 使用 emitLoad (MMIO Read)
                if (expr.op === '$') this.emitLoad(this.regs.V0, 0, this.regs.V0);
                break;
            case 'Call':
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                this.emit(`sw ${this.regs.RA}, 0(${this.regs.SP})`); 
                
                expr.args.forEach((arg, i) => {
                    this.genExpr(arg);
                    if (i < 4) {
                        this.emit(`move $${4+i}, ${this.regs.V0}`);
                    } 
                    if (i < 4) this.emit(`sw $${4+i}, -${(i+2)*4}(${this.regs.SP})`); 
                });
                
                expr.args.forEach((_, i) => {
                     // [修正] 使用 emitLoad
                     if (i < 4) this.emitLoad(`$${4+i}`, `-${(i+2)*4}`, this.regs.SP);
                });

                this.emit(`jal ${expr.callee}`);
                this.emit(`nop`);
                
                // [修正] 使用 emitLoad
                this.emitLoad(this.regs.RA, 0, this.regs.SP);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                break;
        }
    }
}

(function() {
    // 确保命名空间存在
    window.MiniSys = window.MiniSys || {};

    // 编译器入口函数
    function compileInterface(source) {
        try {
            const tokens = tokenize(source);
            const parser = new Parser(tokens);
            const ast = parser.parse();
            const compiler = new Compiler();
            return compiler.compile(ast); 
        } catch(e) {
            console.error(e);
            throw new Error(`编译错误: ${e.message}`); // 抛出错误让 main.js 捕获
        }
    }

    // 挂载 compile 方法
    window.MiniSys.compile = compileInterface;
})();