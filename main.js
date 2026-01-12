/* main.js - Final Fixed Version */
const ide = {
    // 默认代码
    defaultCode: `// Minisys-1A Ultimate Test
void main() {
    int switch_val;
    int key_val;
    int count;
    
    // 1. 开机自检
    smart_display_digit(0);
    light_leds(0);
    $0xFFFFFD10 = 0;
    
    while(1) {
        // 测试开关 -> LED
        switch_val = read_switch();
        light_leds(switch_val);
        
        // 测试键盘 -> 数码管
        key_val = read_keyboard();
        if (key_val != 0) {
            smart_display_digit(key_val);
            // 蜂鸣器反馈
            $0xFFFFFD10 = 1;
            count = 0;
            while(count < 2000) { count = count + 1; }
            $0xFFFFFD10 = 0;
        }
        
        count = 0;
        while(count < 5000) { count = count + 1; }
    }
}`,

    // [关键修正] 给所有 if 语句加上了 { }，适配 mini_c.js 编译器的严格语法
    drivers: `
void light_leds(int code) {
    $0xFFFFFC60 = code;
    return;
}
int read_switch(void) {
    return $0xFFFFFC70;
}
int read_keyboard(void) {
    return $0xFFFFFC10;
}
void display_digit(int loc, int num) {
    int current_val; int shift_bits; int mask;
    // 修正：增加花括号
    if (loc < 0) { loc = 0; } 
    if (loc > 7) { loc = 7; }
    if (num < 0) { num = 0; } 
    if (num > 15) { num = 15; }
    
    shift_bits = loc * 4;
    current_val = $0xFFFFFC00;
    
    mask = 15; 
    mask = mask << shift_bits; 
    mask = mask ^ -1; // 取反
    
    current_val = current_val & mask;
    current_val = current_val | (num << shift_bits);
    $0xFFFFFC00 = current_val;
    return;
}
void smart_display_digit(int value) {
    int current_loc; int data; int remainder;
    current_loc = 0; data = value;
    $0xFFFFFC00 = 0; // Clear
    if (data == 0) { display_digit(0, 0); }
    else {
        while (data > 0 && current_loc < 8) {
            remainder = data % 10;
            data = data / 10;
            display_digit(current_loc, remainder);
            current_loc = current_loc + 1;
        }
    }
    return;
}
`,

    init: function() {
        this.input = document.getElementById('code-input');
        this.highlight = document.getElementById('highlight-layer');
        this.lines = document.getElementById('line-numbers');
        this.input.value = this.defaultCode;
        this.onInput();
        this.log("系统就绪 (已修复驱动语法)。", "success");
    },

    onInput: function() {
        const text = this.input.value;
        this.lines.innerHTML = Array(text.split('\n').length).fill(0).map((_, i) => i + 1).join('<br>');
        this.highlight.innerHTML = this.syntaxHighlight(text);
        this.syncScroll();
    },

    syncScroll: function() {
        this.highlight.scrollTop = this.input.scrollTop;
        this.highlight.scrollLeft = this.input.scrollLeft;
        this.lines.scrollTop = this.input.scrollTop;
    },

    syntaxHighlight: function(code) {
        return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').split('\n').map(l => {
            if (l.trim().startsWith('//')) return `<span class="hl-com">${l}</span>`;
            l = l.replace(/\b(int|void|if|else|while|return)\b/g, '<span class="hl-kw">$1</span>');
            l = l.replace(/\b(0x[\da-fA-F]+|\d+)\b/g, '<span class="hl-num">$1</span>');
            return l;
        }).join('<br>');
    },

    buildRun: function() {
        this.log("正在构建...", "info");
        const userSource = this.input.value;
        const fullSource = this.drivers + "\n" + userSource; // 注入修正后的驱动

        try {
            if (!window.MiniSys || !window.MiniSys.compile) throw new Error("编译器未加载，请检查 index.html");
            let userAsm = window.MiniSys.compile(fullSource);
            userAsm = userAsm.replace(/\.text.*/, '').replace(/\.data.*/, ''); 

            // BIOS (含异常入口)
            const bios = `
.text 0x00000000
__reset_vector:
    j __startup
    nop
__exception_vector:
    j __isr_default
    nop
__startup:
    lui $sp, 0x0
    ori $sp, $sp, 0x4000
    move $fp, $sp
    jal main
    nop
__hang:
    j __hang
    nop
__isr_default:
    eret
    nop
`;
            
            this.log("链接中...", "info");
            let fullAsm = window.MiniSys.Linker.linkAll(bios, userAsm, "", "");
            document.getElementById('output-asm').value = fullAsm;
            
            this.log("汇编中...", "info");
            let result = window.MiniSys.Assembler.assemble(fullAsm);
            
            let coe = window.MiniSys.Convert.textSegToCoe(result.textSeg);
            document.getElementById('output-hex').value = coe;
            
            this.log("✅ 构建成功！", "success");
            this.switchTab('machine');
            
        } catch (e) {
            this.log("❌ 构建失败: " + e.message, "error");
            console.error(e);
        }
    },
    
    log: function(msg, type) {
        const el = document.getElementById('console-log');
        el.innerHTML += `<div class="log-${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        el.scrollTop = el.scrollHeight;
    },
    downloadCoe: function() {
        const content = document.getElementById('output-hex').value;
        if (!content) { alert("请先构建！"); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], {type: 'text/plain'}));
        a.download = 'program.coe';
        a.click();
    },
    switchTab: function(t) {
        document.querySelectorAll('.tab, .tab-content').forEach(e => e.classList.remove('active'));
        document.getElementById('tab-' + t).classList.add('active');
        const btns = document.querySelectorAll('.tab');
        if(t==='asm') btns[0].classList.add('active');
        if(t==='machine') btns[1].classList.add('active');
        if(t==='log') btns[2].classList.add('active');
    },
    createNew: function(type) {
        if(confirm("清空代码？")) {
            this.input.value = type === 'c' ? "void main() {\n    \n}" : "# ASM\n";
            this.onInput();
        }
    }
};

window.onload = () => ide.init();