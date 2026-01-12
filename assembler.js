/* assembler.js */
(function() {
    window.MiniSys = window.MiniSys || {};
    const Utils = window.MiniSys.Utils;
    const InsList = window.MiniSys.MinisysInstructions;
    const MacroRules = window.MiniSys.Macro.expansionRules;

    class TextSeg {
        constructor(startAddr, ins, labels) {
            this.startAddr = startAddr;
            this.ins = ins; // Array of Instruction Instance
            this.labels = labels; // Array of {name, addr}
        }
    }

    class DataSeg {
        constructor(startAddr, vars) {
            this.startAddr = startAddr;
            this.vars = vars;
        }
    }

    // 展开宏 (Linker 需要调用此函数来计算指令数)
    function expandMacros(asmLines) {
        let newAsm = [];
        for(let line of asmLines) {
            line = line.trim();
            if(!line || line.startsWith('#')) continue;
            
            // 提取 Label
            let labelPrefix = "";
            let content = line;
            if (line.includes(':')) {
                let parts = line.split(':');
                labelPrefix = parts[0] + ": ";
                content = parts[1].trim();
            }
            
            if(!content) { newAsm.push(line); continue; }

            let matched = false;
            for (let ruleKey in MacroRules) {
                let rule = MacroRules[ruleKey];
                if (rule.pattern.test(content)) {
                    // 重新执行正则以捕获
                    rule.pattern.test(content);
                    let expanded = rule.replacer();
                    // 第一条指令带上 Label
                    if (labelPrefix) expanded[0] = labelPrefix + expanded[0];
                    expanded.forEach(l => newAsm.push(l));
                    matched = true;
                    break;
                }
            }
            if(!matched) newAsm.push(line);
        }
        return newAsm;
    }

    function parseTextSeg(lines, startAddr) {
        let pc = startAddr;
        let labels = [];
        let instructions = []; // { asm: string, pc: number, insDef: obj }
        
        // Pass 1: 记录 Label 和 指令位置
        for(let line of lines) {
            // Label 处理
            if (line.match(/^\w+:/)) {
                let labelName = line.split(':')[0].trim();
                if (labels.find(l => l.name === labelName)) throw new Utils.SeuError(`重复标签: ${labelName}`);
                labels.push({ name: labelName, addr: pc });
                line = line.split(':')[1].trim();
            }
            if (!line) continue;

            // 匹配指令定义
            let matchedDef = null;
            for (let insDef of InsList) {
                if (insDef.insPattern.test(line)) {
                    matchedDef = insDef;
                    break;
                }
            }
            if (!matchedDef) throw new Utils.SeuError(`未知指令: ${line}`);
            
            instructions.push({ asm: line, pc: pc, def: matchedDef });
            pc += 4;
        }

        // Pass 2: 生成二进制 (解析参数)
        // 此时我们有了所有的 Labels
        let finalIns = instructions.map(item => {
            // 重新正则匹配以设置 RegExp
            item.def.insPattern.test(item.asm);
            
            let binaryParts = item.def.components.map(comp => {
                if (typeof comp.toBinary === 'function') {
                    // 动态计算
                    let res = comp.toBinary(); // 可能返回 string 或 object(label)
                    if (typeof res === 'object' && res.isLabel) {
                        // 解析 Label
                        let target = labels.find(l => l.name === res.name);
                        if (!target) throw new Utils.SeuError(`未定义标签: ${res.name}`);
                        
                        let val = 0;
                        if (res.offset) { // Branch (PC相对)
                            // offset = (Target - (PC+4)) / 4
                            val = (target.addr - (item.pc + 4)) / 4;
                        } else { // Jump (绝对地址 >> 2)
                            val = target.addr / 4;
                        }
                        return Utils.decToBin(val, res.len);
                    }
                    return res;
                }
                return comp.val; // 固定值
            });
            
            // 拼接二进制串
            let binStr = "";
            // 假设 components 是按位从高到低排序的，直接拼接即可？
            // instruction.js 中定义的 R-Type 是 31..26, 25..21 ... 顺序正确
            binaryParts.forEach(b => binStr += b);
            return binStr;
        });

        return {
            ins: finalIns, // Array of '0101...' strings
            startAddr: startAddr
        };
    }

    function assemble(source) {
        // 1. 预处理
        let lines = source.split(/\n/)
            .map(l => l.split('#')[0].split('//')[0].trim()) // 去注释
            .filter(l => l); // 去空行
            
        // 2. 宏展开 (关键步骤)
        lines = expandMacros(lines);

        // 3. 分段
        let dataLines = [];
        let textLines = [];
        let isText = true; // 默认为 text，除非遇到 .data
        let textStart = 0x00000000;

        for (let l of lines) {
            if (l.toLowerCase().startsWith('.data')) { isText = false; continue; }
            if (l.toLowerCase().startsWith('.text')) { 
                isText = true; 
                let match = l.match(/\.text\s+(0x[\da-f]+|\d+)/i);
                if (match) textStart = parseInt(match[1]);
                continue; 
            }
            
            if (isText) textLines.push(l);
            else dataLines.push(l);
        }

        // 4. 解析
        // Data 段暂略 (User C 代码通常只用栈，不生成 .data)
        let textSeg = parseTextSeg(textLines, textStart);
        
        return { textSeg, dataSeg: null };
    }

    window.MiniSys.Assembler = {
        assemble: assemble,
        expandMacros: expandMacros
    };
})();