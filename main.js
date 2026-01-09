const ide = {
    // 默认示例代码 (Mini C)
    defaultCode: `// Minisys-1A Calculator
void main(void) {
    int key_val;
    int sum;
    sum = 0;
    
    while(1) {
        // 读取键盘
        key_val = $0xfffffc10;
        
        if (key_val < 10) {
            $0xffff0010 = key_val;
        }
        if (key_val == 10) {
            sum = sum + key_val;
            $0xffff0010 = sum;
        }
    }
}`,

    init: function() {
        this.input = document.getElementById('code-input');
        this.highlight = document.getElementById('highlight-layer');
        this.lines = document.getElementById('line-numbers');
        
        // 初始化编辑器
        this.input.value = this.defaultCode;
        this.onInput();
        this.log("IDE 初始化完成. Ready.", "info");
    },

    // --- 编辑器核心逻辑 ---
    onInput: function() {
        const text = this.input.value;
        // 1. 更新行号
        const lineCount = text.split('\n').length;
        this.lines.innerHTML = Array(lineCount).fill(0).map((_, i) => i + 1).join('<br>');
        
        // 2. 语法高亮渲染
        this.highlight.innerHTML = this.syntaxHighlight(text);
        this.syncScroll();
    },

    syncScroll: function() {
        this.highlight.scrollTop = this.input.scrollTop;
        this.highlight.scrollLeft = this.input.scrollLeft;
        this.lines.scrollTop = this.input.scrollTop;
    },

    // 简易正则高亮引擎 (支持 Mini C)
    syntaxHighlight: function(code) {
        // 转义 HTML
        code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // 标记规则
        const rules = [
            { regex: /(\/\/.*)/g, cls: 'hl-com' }, // 注释
            { regex: /\b(int|void|if|else|while|return|break|continue)\b/g, cls: 'hl-kw' }, // 关键字
            { regex: /\b(main|input|output)\b/g, cls: 'hl-func' }, // 函数
            { regex: /\b(\d+|0x[0-9a-fA-F]+)\b/g, cls: 'hl-num' }, // 数字
            { regex: /(\$)/g, cls: 'hl-kw' } // MMIO 操作符
        ];

        // 简单的替换策略 (注意：仅用于演示，复杂嵌套需用 Tokenizer)
        // 为防止标签冲突，我们采用占位符法或简单的顺序替换
        // 这里使用一种简化方案：分词处理
        
        // 简单实现：逐行处理
        return code.split('\n').map(line => {
            // 注释特殊处理
            if (line.trim().startsWith('//')) return `<span class="hl-com">${line}</span>`;
            
            // 关键字高亮
            line = line.replace(/\b(int|void|if|else|while|return|break|continue)\b/g, '<span class="hl-kw">$1</span>');
            // 数字/Hex
            line = line.replace(/\b(0x[0-9a-fA-F]+|\d+)\b/g, '<span class="hl-num">$1</span>');
            // MMIO $
            line = line.replace(/(\$)/g, '<span class="hl-kw">$1</span>');
            
            return line;
        }).join('<br>');
    },

    // --- 构建系统 ---
    buildRun: function() {
        this.log("开始编译...", "info");
        const source = this.input.value;

        try {
            // 1. Compile (C -> ASM)
            // 将 C 代码编译为汇编
            if (!window.MiniSys || !window.MiniSys.compile) throw new Error("编译器未加载 (检查 tools_adapter.js)");
            const userAsm = window.MiniSys.compile(source);
            document.getElementById('output-asm').value = userAsm; // 显示生成的汇编
            this.log("C 语言编译成功!", "success");

            // 2. Assemble (ASM -> Object)
            // A. 汇编用户程序
            const userObj = window.MiniSys.assemble(userAsm);

            // B. 汇编 BIOS (使用你上传的真实代码)
            // 注意：我将第 55 行的 'J MAIN' 修改为了 'J main' 以匹配 C 语言入口
            const biosSource = `
# bios.s - MiniSys-1A 启动引导
.text
__RESET_ENTRY:
    J   __BIOS_INIT         # 0x0000: 复位入口
    NOP
__EXCEPTION_VECTOR:
    J   __ISR_HANDLER       # 0x0008: 异常入口
    NOP

__BIOS_INIT:
    # 1. 初始化栈 (0x7000)
    LUI $sp, 0x0000
    ORI $sp, $sp, 0x7000
    MOVE $30, $sp

    # 2. 算术自检 (保留你的原代码)
    LI $t0, 1
    LI $t1, 2
    ADD $t2, $t0, $t1
    SUB $t3, $t2, $t1
    AND $t4, $t2, $t1
    OR  $t5, $t2, $t1
    XOR $t6, $t2, $t1

    # 3. 访存测试
    LI $s0, 0x12345678
    SW $s0, 0($sp)
    LI $s1, 0xAA
    SB $s1, 1($sp)
    LB $s2, 1($sp)
    LBU $s3, 1($sp)

    # 4. 开启中断
    LI $t0, 0x00000001
    MTC0 $t0, 12

    # 5. 跳转到用户程序 (关键修改: MAIN -> main)
    J   main                
    NOP

# --- 异常处理 ---
__ISR_HANDLER:
    MFC0 $k0, 14
    ADDI $k0, $k0, 4
    MTC0 $k0, 14
    ERET
`;
            const biosObj = window.MiniSys.assemble(biosSource);

            // C. 汇编 ISR (如果没有专门的 ISR 代码，可以用空对象)
            // 如果你有 isr.s，也可以像 biosSource 一样在这里定义字符串
            const isrObj = window.MiniSys.assemble(".text\n NOP \n"); 
            
            // 3. Link (Linker)
            // 链接 BIOS(0x0), User(0x400), ISR
            const machineCode = window.MiniSys.link(biosObj, userObj, isrObj);
            
            // 4. 生成 COE Output
            let hexOutput = "memory_initialization_radix=16;\nmemory_initialization_vector=\n";
            machineCode.forEach((word, i) => {
                const hex = (word >>> 0).toString(16).padStart(8, '0');
                hexOutput += hex + (i === machineCode.length - 1 ? ";" : ",\n");
            });

            document.getElementById('output-hex').value = hexOutput;
            this.log("链接成功! 完整系统镜像已生成 (BIOS + User).", "success");
            
            // 自动切换到 HEX 标签查看结果
            this.switchTab('machine');

        } catch (e) {
            this.log("构建失败: " + e.message, "error");
            console.error(e);
        }
    },

    downloadCoe: function() {
        const content = document.getElementById('output-hex').value;
        if (!content) { alert("请先编译!"); return; }
        
        const blob = new Blob([content], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'program.coe';
        a.click();
    },

    // --- UI 工具 ---
    log: function(msg, type) {
        const consoleEl = document.getElementById('console-log');
        const time = new Date().toLocaleTimeString();
        consoleEl.innerHTML += `<div class="log-${type}">[${time}] ${msg}</div>`;
        consoleEl.scrollTop = consoleEl.scrollHeight;
    },

    switchTab: function(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        event.target.classList.add('active'); // 注意：需确保由点击触发
        document.getElementById('tab-' + tabName).classList.add('active');
        
        // 修复 js 直接调用时的 tab 样式问题
        if (!event.target.classList.contains('tab')) {
             document.querySelector(`.tab[onclick*='${tabName}']`).classList.add('active');
        }
    },
    
    createNew: function(type) {
        if(confirm("确定要清空当前代码吗？")) {
            this.input.value = type === 'c' ? "void main(void) {\n    \n}" : "# MIPS Assembly\n.text\n";
            this.onInput();
        }
    }
};

// 启动 IDE
window.onload = () => ide.init();