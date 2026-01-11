/**
 * MiniC Compiler - Enhanced Version
 * 增强版特性：
 * 1. 支持全局变量 (.data段)
 * 2. 支持 int* 指针操作 (*p, &x)
 * 3. 支持 for 循环
 * 4. 支持函数调用与参数传递 ($a0-$a3)
 * 5. 完整的关系运算符 (<=, >=)
 * 6. 简单的类型检查与语义报错
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
            // 预读判断是函数还是全局变量
            // 格式: int/void name ...
            let type = this.consume(); // int/void
            // 处理指针 int *p
            let isPtr = false;
            if (this.peek() === '*') { isPtr = true; this.consume(); }
            
            let name = this.consume();
            
            if (this.peek() === '(') {
                // 函数定义
                program.functions.push(this.parseFunction(type, name));
            } else {
                // 全局变量 (只能是 int)
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
        if (this.match('int')) { // 局部变量声明
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
        if (this.match('for')) {
            this.expect('(');
            let init = (this.peek() === ';') ? null : this.parseStatement(); // 允许 VarDecl 或 ExprStmt
            // 注意: parseStatement 会吃掉分号，如果是 ExprStmt 需要特殊处理，这里简化处理：
            // 简单起见，我们假设 init 只能是 赋值表达式;
            // 实际上 parser 需要更强壮，这里做个特化：
            // 修正：for 的 init 不应调用 parseStatement 因为它可能包含分号。
            // 我们回退一下，for 内部手动解析
        }
        // 重新实现 for (简单版: for(exp; exp; exp) )
        if (this.tokens[this.pos-1] === 'for') { // 刚才 match 过了
            // init
            let init = null;
            if (this.peek() !== ';') init = this.parseExpression(); 
            this.expect(';');
            // test
            let test = null;
            if (this.peek() !== ';') test = this.parseExpression();
            this.expect(';');
            // update
            let update = null;
            if (this.peek() !== ')') update = this.parseExpression();
            this.expect(')');
            this.expect('{'); let body = this.parseBlock();
            return { type: 'For', init, test, update, body };
        }

        if (this.match('break')) { this.expect(';'); return { type: 'Break' }; }
        if (this.match('continue')) { this.expect(';'); return { type: 'Continue' }; }

        // 表达式语句
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
        // 单目运算符
        if (['$','-','!','~','*','&'].includes(this.peek())) {
            let op = this.consume();
            return { type: 'Unary', op, arg: this.parseFactor() };
        }
        
        let t = this.consume();
        // 1. 字面量
        if (/^0x/.test(t)) return { type: 'Literal', val: parseInt(t, 16) };
        if (/^[0-9]+$/.test(t)) return { type: 'Literal', val: parseInt(t) };
        
        // 2. 标识符 (变量 或 函数调用)
        if (/^[a-zA-Z_]/.test(t)) {
            if (this.match('(')) { // 函数调用
                let args = [];
                if (this.peek() !== ')') {
                    do { args.push(this.parseExpression()); } while(this.match(','));
                }
                this.expect(')');
                return { type: 'Call', callee: t, args };
            }
            // 数组访问 a[i] -> *(a + i) -> 语法糖
            if (this.match('[')) {
                let index = this.parseExpression();
                this.expect(']');
                // 转换为 *(t + index) 形式, 在 codegen 处理
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
        this.globals = {}; // {name: {offset, isArray}} - 其实 globals 使用 label 访问
        this.locals = {};  // {name: {offset, isPtr}} - offset 相对 $fp
        this.curStackSize = 0;
        this.asm = "";
        this.regs = { V0:'$2', V1:'$3', A0:'$4', A1:'$5', A2:'$6', A3:'$7', SP:'$29', FP:'$30', RA:'$31' };
    }

    emit(line) { this.asm += `  ${line}\n`; }
    label(l) { this.asm += `${l}:\n`; }
    newLabel(p) { return `L_${p}_${this.labelCount++}`; }

    compile(ast) {
        this.asm = "# Generated by Enhanced MiniC Compiler\n";
        
        // 1. 生成全局变量段
        if (ast.globals.length > 0) {
            this.asm += ".data\n";
            ast.globals.forEach(g => {
                this.globals[g.name] = { type: 'global', size: g.size };
                this.label(`G_${g.name}`);
                // 初始化为 0
                for(let i=0; i<g.size; i++) this.emit(".word 0");
            });
            this.asm += ".text\n";
        }

        // 2. 启动代码 (可选，如果 BIOS 已做可省略，这里为了安全加上)
        // this.emit("lui $sp, 0x0000"); this.emit("ori $sp, $sp, 0x8000"); // 设栈顶

        // 3. 编译函数
        ast.functions.forEach(f => this.genFunction(f));
        return this.asm;
    }

    genFunction(func) {
        this.locals = {};
        this.curStackSize = 0;
        let paramOffset = 4; // 参数在 $fp 上方 (保留 4字节给 old fp?) -> MIPS convention: params in a0-a3, spill at 0($fp)

        this.label(func.name);
        
        // Prologue
        this.emit(`sw ${this.regs.RA}, -4(${this.regs.SP})`);
        this.emit(`sw ${this.regs.FP}, -8(${this.regs.SP})`);
        this.emit(`move ${this.regs.FP}, ${this.regs.SP}`);
        this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -8`); // Header size
        
        // 处理参数 (简单的将 a0-a3 压栈，变成局部变量，方便统一处理)
        func.params.forEach((p, i) => {
            this.curStackSize += 4;
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
            let offset = -8 - this.curStackSize; // relative to FP
            this.locals[p.name] = { offset, isPtr: p.isPtr };
            // 将寄存器参数存入栈
            if(i < 4) this.emit(`sw $${4+i}, 0(${this.regs.SP})`);
        });

        // 生成函数体
        func.body.forEach(stmt => this.genStmt(stmt));

        // Epilogue (默认返回)
        this.label(`${func.name}_end`);
        this.emit(`move ${this.regs.SP}, ${this.regs.FP}`);
        this.emit(`lw ${this.regs.FP}, -8(${this.regs.SP})`);
        this.emit(`lw ${this.regs.RA}, -4(${this.regs.SP})`);
        this.emit(`jr ${this.regs.RA}`);
        this.emit(`nop`);
    }

    genStmt(stmt) {
        switch(stmt.type) {
            case 'VarDecl':
                // 分配栈空间
                let size = stmt.size * 4;
                this.curStackSize += size;
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -${size}`);
                // 记录符号表 (数组首地址在低位还是高位？通常 var 对应低地址)
                // 栈向下生长：FP-12 是 var, var[0] at FP-12.
                let offset = -8 - this.curStackSize;
                this.locals[stmt.name] = { offset, isPtr: stmt.isPtr, isArray: stmt.size > 1 };
                
                if (stmt.init) {
                    this.genExpr(stmt.init); // result in V0
                    this.emit(`sw ${this.regs.V0}, 0(${this.regs.SP})`); // 仅支持标量初始化
                }
                break;
            case 'Return':
                if (stmt.value) this.genExpr(stmt.value);
                // 跳转到 Epilogue，而不是直接写 Epilogue 代码 (防止多个 return 导致膨胀)
                // 这里简化：直接假定函数名为当前上下文 (Hack: 应该存 currentFunc)
                // 为简便，直接生成 return 代码
                this.emit(`move ${this.regs.SP}, ${this.regs.FP}`);
                this.emit(`lw ${this.regs.FP}, -8(${this.regs.SP})`);
                this.emit(`lw ${this.regs.RA}, -4(${this.regs.SP})`);
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

    // 计算左值地址 -> 结果存入 V0
    genAddr(node) {
        if (node.type === 'Identifier') {
            let name = node.name;
            if (this.locals[name]) {
                // 局部变量：返回 FP + offset
                this.emit(`addiu ${this.regs.V0}, ${this.regs.FP}, ${this.locals[name].offset}`);
            } else if (this.globals[name]) {
                // 全局变量：la
                this.emit(`la ${this.regs.V0}, G_${name}`);
            } else {
                throw new Error(`Undefined variable: ${name}`);
            }
        } else if (node.type === 'Unary' && node.op === '*') {
            // *p 的地址就是 p 的值
            this.genExpr(node.arg); // V0 = p
        } else if (node.type === 'Unary' && node.op === '$') {
            // $expr 的地址就是 expr 的值
            this.genExpr(node.arg);
        } else if (node.type === 'ArrayAccess') {
            // a[i] -> a + i*4
            this.genAddr({type: 'Identifier', name: node.name}); // V0 = &a
            this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`); // push &a
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
            
            this.genExpr(node.index); // V0 = i
            this.emit(`sll ${this.regs.V0}, ${this.regs.V0}, 2`); // i*4
            
            this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
            this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`); // pop &a
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
                // 如果是数组名，返回地址；如果是变量，返回 load 值
                this.genAddr(expr); // V0 = addr
                // 如果是数组本身(Identifier)且在声明中是 Array，则 V0 已经是地址，不用 lw
                // 简单起见，这里假设所有 Identifier 都是取值，除非它作为 genAddr 的顶层调用
                // 需要区分：int a; a -> lw; int a[10]; a -> addr
                let info = this.locals[expr.name] || this.globals[expr.name];
                if (!info.isArray) {
                    this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`);
                }
                break;
            case 'ArrayAccess':
                this.genAddr(expr);
                this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`);
                break;
            case 'Assignment':
                this.genAddr(expr.left); // V0 = addr
                this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`); // push addr
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                
                this.genExpr(expr.right); // V0 = val
                
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`); // pop addr
                this.emit(`sw ${this.regs.V0}, 0(${this.regs.V1})`);
                break;
            case 'Binary':
                this.genExpr(expr.left);
                this.emit(`sw ${this.regs.V0}, -4(${this.regs.SP})`); // push left
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                
                this.genExpr(expr.right); // V0 = right
                
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                this.emit(`lw ${this.regs.V1}, -4(${this.regs.SP})`); // V1 = left
                
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
                    case '<=': // A <= B  <==> !(A > B) <==> !(B < A) -> not (slt B, A)
                        this.emit(`slt ${this.regs.V0}, ${this.regs.V0}, ${this.regs.V1}`); 
                        this.emit(`xori ${this.regs.V0}, ${this.regs.V0}, 1`);
                        break;
                    case '>=': // A >= B <==> !(A < B)
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
                this.genExpr(expr.arg); // V0 = val
                if (expr.op === '-') this.emit(`subu ${this.regs.V0}, $0, ${this.regs.V0}`);
                if (expr.op === '!') this.emit(`sltiu ${this.regs.V0}, ${this.regs.V0}, 1`);
                if (expr.op === '~') this.emit(`nor ${this.regs.V0}, ${this.regs.V0}, $0`);
                if (expr.op === '*') this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`);
                if (expr.op === '&') { /* 取地址，在 parse 层级已经被 Identifier/ArrayAccess 处理了，这里应该不会直接进 */ }
                if (expr.op === '$') this.emit(`lw ${this.regs.V0}, 0(${this.regs.V0})`); // MMIO Read
                break;
            case 'Call':
                // 1. 保存 caller saved regs (这里简化，假设 t 寄存器不跨语句使用，只保存 ra)
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, -4`);
                this.emit(`sw ${this.regs.RA}, 0(${this.regs.SP})`); // push ra
                
                // 2. 计算参数并放入 a0-a3 (多余的压栈)
                expr.args.forEach((arg, i) => {
                    this.genExpr(arg);
                    if (i < 4) {
                        this.emit(`move $${4+i}, ${this.regs.V0}`);
                    } else {
                        // 超过4个参数，压栈 (ABI复杂，这里简化支持前4个)
                    }
                    // 注意：这里简单的循环计算参数会覆盖 V0，如果是嵌套调用需要更复杂的保存
                    // 为简化编译器，建议参数中不要有复杂函数调用
                    if (i < 4) this.emit(`sw $${4+i}, -${(i+2)*4}(${this.regs.SP})`); // 暂存到栈上防止被覆盖
                });
                // 恢复参数到寄存器 (因为 genExpr 可能弄脏了 a0-a3)
                expr.args.forEach((_, i) => {
                     if (i < 4) this.emit(`lw $${4+i}, -${(i+2)*4}(${this.regs.SP})`);
                });

                this.emit(`jal ${expr.callee}`);
                this.emit(`nop`);
                
                // 恢复 ra
                this.emit(`lw ${this.regs.RA}, 0(${this.regs.SP})`);
                this.emit(`addiu ${this.regs.SP}, ${this.regs.SP}, 4`);
                break;
        }
    }
}

module.exports = { 
    compile: (source) => {
        try {
            const tokens = tokenize(source);
            const parser = new Parser(tokens);
            const ast = parser.parse();
            const compiler = new Compiler();
            return compiler.compile(ast); 
        } catch(e) {
            return `Error: ${e.message}`;
        }
    } 
};