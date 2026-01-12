/* main.js - IDE Controller with Driver Injection */
const ide = {
    // 默认用户代码 (现在非常简洁，不再包含驱动实现)
    defaultCode: `// Minisys-1A Calculator Test
void main(void) {
    int key_val;
    int sum;
    sum = 0;
    
    // 初始化：清空显示
    smart_display_digit(0);
    
    while(1) {
        key_val = read_keyboard();
        
        if (key_val != 0) {
            // 如果按键按下，显示键值
            smart_display_digit(key_val);
            light_leds(key_val); // 同时点亮LED
        }
    }
}`,

    // [新增] 预置驱动库代码 (标准版 Minisys 驱动)
    // 这些代码会在编译时自动插入到用户代码之前
    drivers: `
// --- Minisys-1A Driver Library (Auto-Injected) ---

// 1. LED Driver
void light_leds(int code) {
    $0xFFFFFC60 = code;
    return;
}

// 2. Switch Driver
int read_switch(void) {
    return $0xFFFFFC70;
}

// 3. Keyboard Driver
int read_keyboard(void) {
    return $0xFFFFFC10;
}

// 4. Digits Driver
void display_digit(int loc, int num) {
    int current_val;
    int shift_bits;
    int mask;
    if (loc < 0) loc = 0; if (loc > 7) loc = 7;
    if (num < 0) num = 0; if (num > 15) num = 15;
    shift_bits = loc * 4;
    current_val = $0xFFFFFC00;
    mask = 15; mask = mask << shift_bits; mask = mask ^ -1;
    current_val = current_val & mask;
    current_val = current_val | (num << shift_bits);
    $0xFFFFFC00 = current_val;
    return;
}

void smart_display_digit(int value) {
    int current_loc;
    int data;
    int remainder;
    current_loc = 0;
    data = value;
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
// --- End of Drivers ---
`,

    init: function() {
        this.input = document.getElementById('code-input');
        this.highlight = document.getElementById('highlight-layer');
        this.lines = document.getElementById('line-numbers');
        this.input.value = this.defaultCode;
        this.onInput();
        this.log("IDE Ready. (Drivers will be auto-linked)", "info");
    },

    // ... (onInput, syncScroll, syntaxHighlight 保持不变) ...
    onInput: function() { /* 同前 */ },
    syncScroll: function() { /* 同前 */ },
    syntaxHighlight: function(c) { /* 同前 */ },

    // --- 核心修改：buildRun ---
    buildRun: function() {
        this.log("开始构建...", "info");
        
        // 1. 获取用户代码
        const userSource = this.input.value;
        
        // 2. [关键步骤] 注入驱动代码
        // 将驱动库拼接到用户代码之前
        const fullSource = this.drivers + "\n" + userSource;

        try {
            // 3. 编译 (C -> User ASM)
            // 编译合并后的代码
            if (!window.MiniSys || !window.MiniSys.compile) throw new Error("Compiler not loaded");
            let userAsm = window.MiniSys.compile(fullSource);
            
            // 4. 清理 ASM 头部 (去除 .text/.data，由 Linker 接管)
            userAsm = userAsm.replace(/\.text.*/, '').replace(/\.data.*/, '');
            
            // 5. Link (BIOS + User ASM)
            const bios = `
.text 0x00000000
__reset_vector:
    j __startup         # 0x0000: 复位跳转
    nop

__exception_vector:     # 0x0008: 异常/中断入口
    j __isr_default
    nop

    # --- 启动代码 ---
__startup:
    lui $sp, 0x0
    ori $sp, $sp, 0x4000 # 初始化栈指针 SP = 0x4000
    move $fp, $sp        # 初始化帧指针 FP

    # 可选：算术自检，防止 ALU 故障
    addi $t0, $0, 1
    
    # 跳转到用户 main 函数
    jal main
    nop
    
    # 如果 main 返回了，进入死循环
__hang:
    j __hang
    nop

    # --- 默认中断处理 (忽略中断) ---
__isr_default:
    eret                 # 异常返回，防止 CPU 卡死
    nop
`;
            
            this.log("正在链接 (注入标准驱动与BIOS)...", "info");
            
            // 使用 Linker.linkAll 拼接：BIOS, UserASM, ISR Entry, ISR Handler
            // 这里我们暂时不需要复杂的中断入口，传空字符串即可，因为 BIOS 里已经写了
            let fullAsm = window.MiniSys.Linker.linkAll(bios, userAsm, "", "");
            
            document.getElementById('output-asm').value = fullAsm;
            
            // 6. Assemble
            this.log("正在汇编...", "info");
            let result = window.MiniSys.Assembler.assemble(fullAsm);
            
            // 7. Convert COE
            let coe = window.MiniSys.Convert.textSegToCoe(result.textSeg);
            document.getElementById('output-hex').value = coe;
            
            this.log("构建成功! (User Code + Standard Drivers)", "success");
            this.switchTab('machine');
            
        } catch (e) {
            this.log(e.message, "error");
            console.error(e);
        }
    },
    
    // ... (downloadCoe, log, switchTab, createNew 同前) ...
    log: function(msg, type) {
        const el = document.getElementById('console-log');
        el.innerHTML += `<div class="log-${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        el.scrollTop = el.scrollHeight;
    },
    switchTab: function(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        // 修复点击逻辑
        let btn = document.querySelector(`.tab[onclick*='${tabName}']`);
        if(btn) btn.classList.add('active');
        else if(event && event.target) event.target.classList.add('active');
        
        document.getElementById('tab-' + tabName).classList.add('active');
    },
    downloadCoe: function() { /* 同前 */ },
    createNew: function(type) {
        if(confirm("清空？")) {
            // 新建时，只给一个纯净的 main 函数模板，不包含驱动，保持整洁
            this.input.value = type === 'c' ? "void main() {\n    // Write code here. Drivers are ready.\n    light_leds(0x55);\n}" : "# ASM\n";
            this.onInput();
        }
    }
};

window.onload = () => ide.init();