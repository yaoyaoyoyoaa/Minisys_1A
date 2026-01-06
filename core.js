/**
 * MiniSys-1A Assembler Core - 用户版 (已适配 Linker)
 */
const fs = require('fs');

// 寄存器名称到编号映射
const regMap = {
    zero: 0, at: 1, v0: 2, v1: 3, a0: 4, a1: 5, a2: 6, a3: 7,
    t0: 8,   t1: 9,  t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15,
    s0: 16,  s1: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
    t8: 24,  t9: 25, k0: 26, k1: 27, gp: 28, sp: 29, fp: 30, ra: 31,
    '$0': 0 // 兼容写 $0 的情况
};

// 工具函数：编码指令
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

function assemblerCore(source) {
    const lines = source.split(/\r?\n/);
    let labels = {};
    let pc = 0;
    let relocations = []; // 新增：用于存储需要 Linker 解决的跳转

    // --- 第一遍扫描：记录 Label ---
    let tempPc = 0;
    lines.forEach(line => {
        line = line.split('#')[0].trim(); // 修改：支持 # 注释
        if (!line) return;
        if (line.includes(':')) {
            const label = line.split(':')[0].trim(); // 保持原样大小写，防止匹配错误
            labels[label] = tempPc;
            line = line.split(':')[1].trim();
        }
        if (!line) return;

        // 简易处理伪指令长度预估
        const parts = line.split(/\s+/);
        const op = parts[0].toUpperCase();
        if (op === 'LI') tempPc += 4; // 简化：假设 LI 只生成一条指令(ADDIU)
        else tempPc += 4;
    });

    // --- 第二遍扫描：生成机器码 ---
    pc = 0;
    let machineCodes = [];

    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (line.includes(':')) line = line.split(':')[1].trim();
        if (!line) return;

        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();

        try {
            switch (op) {
                // --- 伪指令支持 (新增) ---
                case 'LI': {
                    // LI $t0, 100 -> ADDIU $t0, $0, 100
                    const rt = parseReg(parts[1]);
                    const imm = parseImm(parts[2]);
                    machineCodes.push(encodeI(0x09, 0, rt, imm)); 
                    break;
                }
                case 'MOVE': {
                    // MOVE $t0, $t1 -> ADDU $t0, $t1, $0
                    const rd = parseReg(parts[1]);
                    const rs = parseReg(parts[2]);
                    machineCodes.push(encodeR(rs, 0, rd, 0, 0x21)); // ADDU
                    break;
                }
                case 'NOP': machineCodes.push(0x00000000); break;

                // --- R-Type ---
                case 'ADD':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x20)); break;
                case 'SUB':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x22)); break;
                case 'AND':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x24)); break;
                case 'OR':   machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x25)); break;
                case 'XOR':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x26)); break;
                case 'SLT':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2A)); break;
                case 'SLL':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x00)); break;
                case 'SRL':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x02)); break;
                case 'SRA':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x03)); break;
                case 'JR':   machineCodes.push(encodeR(parseReg(parts[1]), 0, 0, 0, 0x08)); break;

                // --- I-Type ---
                case 'ADDI': machineCodes.push(encodeI(0x08, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); break;
                case 'ADDIU':machineCodes.push(encodeI(0x09, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); break;
                case 'ORI':  machineCodes.push(encodeI(0x0D, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); break;
                case 'LUI':  machineCodes.push(encodeI(0x0F, 0, parseReg(parts[1]), parseInt(parts[2]))); break;
                
                case 'LW':   
                case 'LB': 
                case 'LBU':
                case 'LH': 
                case 'LHU': {
                    const map = { 'LW':0x23, 'LB':0x20, 'LBU':0x24, 'LH':0x21, 'LHU':0x25 };
                    const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                    if(match) {
                        machineCodes.push(encodeI(map[op], parseReg(match[2]), parseReg(parts[1]), parseImm(match[1])));
                    }
                    break;
                }
                case 'SW':
                case 'SB': 
                case 'SH': {
                    const map = { 'SW':0x2B, 'SB':0x28, 'SH':0x29 };
                    const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                    if(match) {
                        machineCodes.push(encodeI(map[op], parseReg(match[2]), parseReg(parts[1]), parseImm(match[1])));
                    }
                    break;
                }
                
                // --- 分支与跳转 (修改：使用 Relocation) ---
                case 'BEQ': 
                case 'BNE': {
                    const label = parts[3];
                    // 记录下来交给 Linker 计算偏移
                    relocations.push({ type: op, pc: pc, label: label });
                    // 暂时填 0
                    machineCodes.push(encodeI(op==='BEQ'?0x04:0x05, parseReg(parts[1]), parseReg(parts[2]), 0));
                    break;
                }
                case 'J':    
                case 'JAL': {
                    const label = parts[1];
                    relocations.push({ type: op, pc: pc, label: label });
                    machineCodes.push(encodeJ(op==='J'?0x02:0x03, 0)); 
                    break;
                }

                // --- CP0 ---
                case 'MTC0': machineCodes.push(((0x10 << 26) | (0x04 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0); break;
                case 'MFC0': machineCodes.push(((0x10 << 26) | (0x00 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0); break;
                case 'ERET': machineCodes.push(0x42000018); break;

                default: break;
            }
            pc += 4;
        } catch (e) {
            console.error(`Error at line: ${line} - ${e.message}`);
        }
    });

    // **重要修改**：返回对象结构以配合 linker.js
    return { 
        text: machineCodes, 
        symbols: labels, 
        relocations: relocations 
    };
}

module.exports = { assemblerCore };