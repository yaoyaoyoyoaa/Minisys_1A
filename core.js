/**
 * MiniSys-1A Assembler Core - Fixed Version
 * 修复了 PC 计数逻辑，解决了 .text 等伪指令导致的地址错位问题
 */
const fs = require('fs');

// 寄存器映射
const regMap = {
    zero: 0, at: 1, v0: 2, v1: 3, a0: 4, a1: 5, a2: 6, a3: 7,
    t0: 8,   t1: 9,  t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15,
    s0: 16,  s1: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
    t8: 24,  t9: 25, k0: 26, k1: 27, gp: 28, sp: 29, fp: 30, ra: 31,
    '$0': 0
};

// 编码工具函数
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
    let relocations = []; 
    
    // --- 第一遍扫描：计算标签地址 ---
    let tempPc = 0;
    lines.forEach(line => {
        line = line.split('#')[0].trim(); // 去注释
        if (!line) return;
        
        // 处理标签
        if (line.includes(':')) {
            const parts = line.split(':');
            const label = parts[0].trim();
            labels[label] = tempPc;
            line = parts[1].trim(); // 保留标签后的指令
        }
        if (!line) return;
        
        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        
        // [修复] 忽略伪指令，不增加 PC
        if (op.startsWith('.')) return; 

        // 伪指令特殊处理
        if (op === 'LI') tempPc += 4; 
        else tempPc += 4;
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

        // [修复] 忽略伪指令
        if (op.startsWith('.')) return;

        let generated = false; // 标记是否生成了指令

        try {
            switch (op) {
                // === 伪指令 ===
                case 'LI': { 
                    const rt = parseReg(parts[1]);
                    const imm = parseImm(parts[2]);
                    machineCodes.push(encodeI(0x09, 0, rt, imm)); 
                    generated = true;
                    break;
                }
                case 'MOVE': { 
                    const rd = parseReg(parts[1]);
                    const rs = parseReg(parts[2]);
                    machineCodes.push(encodeR(rs, 0, rd, 0, 0x21)); 
                    generated = true;
                    break;
                }
                case 'NOP': machineCodes.push(0); generated = true; break;

                // === R-Type ===
                case 'ADD':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x20)); generated = true; break;
                case 'ADDU': machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x21)); generated = true; break;
                case 'SUB':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x22)); generated = true; break;
                case 'SUBU': machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x23)); generated = true; break;
                case 'AND':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x24)); generated = true; break;
                case 'OR':   machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x25)); generated = true; break;
                case 'XOR':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x26)); generated = true; break;
                case 'NOR':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x27)); generated = true; break;
                case 'SLT':  machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2A)); generated = true; break;
                case 'SLTU': machineCodes.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2B)); generated = true; break;

                // 移位
                case 'SLL':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x00)); generated = true; break;
                case 'SRL':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x02)); generated = true; break;
                case 'SRA':  machineCodes.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x03)); generated = true; break;
                case 'SLLV': machineCodes.push(encodeR(parseReg(parts[3]), parseReg(parts[2]), parseReg(parts[1]), 0, 0x04)); generated = true; break;
                case 'SRLV': machineCodes.push(encodeR(parseReg(parts[3]), parseReg(parts[2]), parseReg(parts[1]), 0, 0x06)); generated = true; break;
                case 'SRAV': machineCodes.push(encodeR(parseReg(parts[3]), parseReg(parts[2]), parseReg(parts[1]), 0, 0x07)); generated = true; break;

                // 跳转
                case 'JR':   machineCodes.push(encodeR(parseReg(parts[1]), 0, 0, 0, 0x08)); generated = true; break;
                case 'JALR': machineCodes.push(encodeR(parseReg(parts[1]), 0, parseReg(parts[2])||31, 0, 0x09)); generated = true; break;

                // 乘除 & HILO
                case 'MULT': machineCodes.push(encodeR(parseReg(parts[1]), parseReg(parts[2]), 0, 0, 0x18)); generated = true; break;
                case 'MULTU':machineCodes.push(encodeR(parseReg(parts[1]), parseReg(parts[2]), 0, 0, 0x19)); generated = true; break;
                case 'DIV':  machineCodes.push(encodeR(parseReg(parts[1]), parseReg(parts[2]), 0, 0, 0x1A)); generated = true; break;
                case 'DIVU': machineCodes.push(encodeR(parseReg(parts[1]), parseReg(parts[2]), 0, 0, 0x1B)); generated = true; break;
                case 'MFHI': machineCodes.push(encodeR(0, 0, parseReg(parts[1]), 0, 0x10)); generated = true; break;
                case 'MFLO': machineCodes.push(encodeR(0, 0, parseReg(parts[1]), 0, 0x12)); generated = true; break;
                case 'MTHI': machineCodes.push(encodeR(parseReg(parts[1]), 0, 0, 0, 0x11)); generated = true; break;
                case 'MTLO': machineCodes.push(encodeR(parseReg(parts[1]), 0, 0, 0, 0x13)); generated = true; break;

                // === I-Type ===
                case 'ADDI': machineCodes.push(encodeI(0x08, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'ADDIU':machineCodes.push(encodeI(0x09, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'ANDI': machineCodes.push(encodeI(0x0C, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'ORI':  machineCodes.push(encodeI(0x0D, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'XORI': machineCodes.push(encodeI(0x0E, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'LUI':  machineCodes.push(encodeI(0x0F, 0, parseReg(parts[1]), parseInt(parts[2]))); generated = true; break;
                case 'SLTI': machineCodes.push(encodeI(0x0A, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;
                case 'SLTIU':machineCodes.push(encodeI(0x0B, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]))); generated = true; break;

                // Load/Store
                case 'LW': case 'LB': case 'LBU': case 'LH': case 'LHU': 
                case 'SW': case 'SB': case 'SH': {
                    const map = { 
                        'LW':0x23, 'LB':0x20, 'LBU':0x24, 'LH':0x21, 'LHU':0x25,
                        'SW':0x2B, 'SB':0x28, 'SH':0x29 
                    };
                    const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                    if(match) {
                        machineCodes.push(encodeI(map[op], parseReg(match[2]), parseReg(parts[1]), parseImm(match[1])));
                        generated = true;
                    }
                    break;
                }

                // Branch
                case 'BEQ': 
                case 'BNE': 
                case 'BLEZ': 
                case 'BGTZ': 
                {
                    const label = parts[op.startsWith('B') && parts.length===4 ? 3 : 2]; 
                    relocations.push({ type: op, pc: pc, label: label });
                    
                    let opcode = 0; let rt = 0; let rs = 0;
                    if (op === 'BEQ') { opcode = 0x04; rs = parseReg(parts[1]); rt = parseReg(parts[2]); }
                    else if (op === 'BNE') { opcode = 0x05; rs = parseReg(parts[1]); rt = parseReg(parts[2]); }
                    else if (op === 'BLEZ') { opcode = 0x06; rs = parseReg(parts[1]); rt = 0; }
                    else if (op === 'BGTZ') { opcode = 0x07; rs = parseReg(parts[1]); rt = 0; }

                    machineCodes.push(encodeI(opcode, rs, rt, 0)); 
                    generated = true;
                    break;
                }

                case 'BLTZ': case 'BGEZ': case 'BLTZAL': case 'BGEZAL':
                {
                    const label = parts[2];
                    relocations.push({ type: op, pc: pc, label: label });
                    let rt = 0;
                    if (op === 'BLTZ') rt = 0;
                    if (op === 'BGEZ') rt = 1;
                    if (op === 'BLTZAL') rt = 16;
                    if (op === 'BGEZAL') rt = 17;
                    machineCodes.push(encodeI(0x01, parseReg(parts[1]), rt, 0));
                    generated = true;
                    break;
                }

                // J-Type
                case 'J':   
                case 'JAL': {
                    const label = parts[1];
                    relocations.push({ type: op, pc: pc, label: label });
                    machineCodes.push(encodeJ(op==='J'?0x02:0x03, 0)); 
                    generated = true;
                    break;
                }

                // CP0
                case 'MTC0': machineCodes.push(((0x10 << 26) | (0x04 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0); generated = true; break;
                case 'MFC0': machineCodes.push(((0x10 << 26) | (0x00 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0); generated = true; break;
                case 'ERET': machineCodes.push(0x42000018); generated = true; break;

                default: break;
            }
            // [修复] 只有生成了代码，才增加 PC
            if (generated) pc += 4;
            
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

module.exports = { assemblerCore };