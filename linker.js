/* linker.js */
(function() {
    window.MiniSys = window.MiniSys || {};
    const Assembler = window.MiniSys.Assembler;

    function countIns(asmText) {
        if (!asmText) return 0;
        let lines = asmText.split('\n')
            .map(l => l.split('#')[0].trim())
            .filter(l => l && !l.startsWith('.'));
        
        // 关键：展开宏后才能知道真实指令数
        // 比如 push $t0 是一条宏，但占 2 条指令
        let expanded = Assembler.expandMacros(lines);
        
        // 过滤掉纯 Label 行
        let count = 0;
        for (let l of expanded) {
            if (!l.match(/^\w+:$/)) count++;
        }
        return count;
    }

    function linkAll(biosASM, userASM, intEntryASM, intHandlerASM) {
        // 内存布局 (Word Count)
        const BIOS_LIMIT = 320; // 0x0 - 0x500
        const USER_LIMIT = 5120; // 0x500 - 0x5500 (20KB)
        // 0xF000 是中断入口 (Word Addr = 0x3C00) -> 偏移 15360 字
        // 我们的当前偏移是 320 + 5120 = 5440
        const INT_ENTRY_OFFSET = 15360; 
        
        let biosLen = countIns(biosASM);
        let userLen = countIns(userASM);
        
        if (biosLen > BIOS_LIMIT) throw new Error(`BIOS 代码过长: ${biosLen}`);
        if (userLen > USER_LIMIT) throw new Error(`用户代码过长: ${userLen}`);
        
        let biosPad = BIOS_LIMIT - biosLen;
        let userPad = USER_LIMIT - userLen;
        
        // 计算从 User 结束到 ISR 入口的填充
        let currentTotal = BIOS_LIMIT + USER_LIMIT;
        let midPad = INT_ENTRY_OFFSET - currentTotal;
        
        if (midPad < 0) throw new Error("代码重叠：用户代码区侵入中断区");

        let full = ".text 0x00000000\n";
        full += biosASM + "\n";
        full += "nop\n".repeat(biosPad);
        
        full += userASM + "\n";
        full += "nop\n".repeat(userPad);
        
        full += "nop\n".repeat(midPad); // 填充到 0xF000
        
        full += (intEntryASM || "") + "\n";
        // 0xF000 后的填充和 Handler 暂略，保证主要逻辑正确
        
        return full;
    }

    window.MiniSys.Linker = { linkAll: linkAll };
})();