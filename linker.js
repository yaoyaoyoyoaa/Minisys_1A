/**
 * MiniSys-1A Linker - 增强重定位与布局版
 */

// 1. 定义物理内存布局 (字地址)
// 硬件复位 PC=0x00000000 (BIOS)
// 硬件异常入口 PC=0x00000008 (ISR 跳转点)
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

module.exports = { linker };
