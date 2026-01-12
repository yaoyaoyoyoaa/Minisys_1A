/**
 * MiniSys-1A Assembler Core - Fixed Version (Final)
 * 修复了 LI 32位立即数加载问题、PC 计数逻辑，以及伪指令扩展支持
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

// 辅助：判断指令会生成多少字节 (用于第一遍扫描计算 Label 地址)
function getInstructionSize(op, parts) {
    if (op.startsWith('.')) return 0; // 伪指令 .text 等
    if (op === 'LI') {
        const imm = parseImm(parts[2]);
        // 如果是 16 位能表示的数，生成 1 条指令；否则生成 2 条 (LUI + ORI)
        if (imm >= -32768 && imm <= 65535) return 4;
        return 8;
    }
    return 4; // 其他指令默认 4 字节
}

function assemblerCore(source) {
    const lines = source.split(/\r?\n/);
    let labels = {};
    let relocations = []; 
    
    // --- 第一遍扫描：计算标签地址 ---
    let tempPc = 0;
    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (!line) return;
        
        if (line.includes(':')) {
            const parts = line.split(':');
            labels[parts[0].trim()] = tempPc;
            line = parts[1].trim();
        }
        if (!line) return;
        
        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        
        tempPc += getInstructionSize(op, parts);
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
        if (op.startsWith('.')) return;

        let instBuffer = []; // 暂存当前行生成的指令

        try {
            switch (op) {
                // === 伪指令修复 ===
                case 'LI': { 
                    const rt = parseReg(parts[1]);
                    const imm = parseImm(parts[2]);
                    // 智能扩展：16位用 ADDIU/ORI，32位用 LUI+ORI
                    if (imm >= -32768 && imm <= 32767) {
                        // Signed 16-bit
                        instBuffer.push(encodeI(0x09, 0, rt, imm)); // ADDIU
                    } else if (imm >= 0 && imm <= 65535) {
                        // Unsigned 16-bit
                        instBuffer.push(encodeI(0x0D, 0, rt, imm)); // ORI
                    } else {
                        // 32-bit: LUI + ORI
                        const upper = (imm >>> 16) & 0xFFFF;
                        const lower = imm & 0xFFFF;
                        instBuffer.push(encodeI(0x0F, 0, rt, upper)); // LUI rt, upper
                        if (lower !== 0) {
                            instBuffer.push(encodeI(0x0D, rt, rt, lower)); // ORI rt, rt, lower
                        }
                    }
                    break;
                }
                case 'MOVE': { 
                    const rd = parseReg(parts[1]);
                    const rs = parseReg(parts[2]);
                    instBuffer.push(encodeR(rs, 0, rd, 0, 0x21)); // ADDU rd, rs, $0
                    break;
                }
                case 'NOP': instBuffer.push(0); break;

                // === 常用指令 ===
                case 'SW': {
                    // 支持 SW $t0, 0($sp) 和 SW $t0, $sp (默认偏移0)
                    let rs = 0, offset = 0;
                    if (parts[2].includes('(')) {
                        const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                        if (match) { offset = parseImm(match[1]); rs = parseReg(match[2]); }
                    } else {
                        rs = parseReg(parts[2]);
                    }
                    instBuffer.push(encodeI(0x2B, rs, parseReg(parts[1]), offset));
                    break;
                }
                case 'LW': {
                    let rs = 0, offset = 0;
                    if (parts[2].includes('(')) {
                        const match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                        if (match) { offset = parseImm(match[1]); rs = parseReg(match[2]); }
                    } else {
                        rs = parseReg(parts[2]);
                    }
                    instBuffer.push(encodeI(0x23, rs, parseReg(parts[1]), offset));
                    break;
                }
                
                // === R-Type ===
                case 'ADD':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x20)); break;
                case 'ADDU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x21)); break;
                case 'SUB':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x22)); break;
                case 'SUBU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x23)); break;
                case 'AND':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x24)); break;
                case 'OR':   instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x25)); break;
                case 'XOR':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x26)); break;
                case 'NOR':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x27)); break;
                case 'SLT':  instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2A)); break;
                case 'SLTU': instBuffer.push(encodeR(parseReg(parts[2]), parseReg(parts[3]), parseReg(parts[1]), 0, 0x2B)); break;

                // 移位
                case 'SLL':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x00)); break;
                case 'SRL':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x02)); break;
                case 'SRA':  instBuffer.push(encodeR(0, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3]), 0x03)); break;

                // Branch
                case 'BEQ': 
                case 'BNE': 
                {
                    relocations.push({ type: op, pc: pc, label: parts[3] });
                    const opcode = (op === 'BEQ') ? 0x04 : 0x05;
                    instBuffer.push(encodeI(opcode, parseReg(parts[1]), parseReg(parts[2]), 0));
                    break;
                }
                
                // Jump
                case 'J':   
                case 'JAL': 
                    relocations.push({ type: op, pc: pc, label: parts[1] });
                    instBuffer.push(encodeJ(op==='J'?0x02:0x03, 0)); 
                    break;

                // 其他指令 (I-Type, System, etc) 可沿用旧代码，此处为简化仅列出关键修复
                // 请确保原有代码的其他 case 依然存在，或者直接复制上面修复的逻辑到你的完整文件中
                default: 
                    // 兜底处理：尝试标准 R/I 格式，防止漏掉指令
                    if(['ADDI','ADDIU','ANDI','ORI','XORI','SLTI','SLTIU'].includes(op)) {
                         let opcode = 0;
                         if(op=='ADDI') opcode=0x08; if(op=='ADDIU') opcode=0x09;
                         if(op=='ANDI') opcode=0x0C; if(op=='ORI') opcode=0x0D;
                         if(op=='XORI') opcode=0x0E; if(op=='SLTI') opcode=0x0A;
                         if(op=='SLTIU') opcode=0x0B;
                         instBuffer.push(encodeI(opcode, parseReg(parts[2]), parseReg(parts[1]), parseInt(parts[3])));
                    }
                    else if(['SB','SH','LB','LBU','LH','LHU'].includes(op)) {
                         // Copy LW/SW logic
                         let map = {'SB':0x28,'SH':0x29,'LB':0x20,'LBU':0x24,'LH':0x21,'LHU':0x25};
                         let match = parts[2].match(/(-?\d+|0x[0-9a-fA-F]+)\((\$\w+)\)/);
                         if(match) instBuffer.push(encodeI(map[op], parseReg(match[2]), parseReg(parts[1]), parseImm(match[1])));
                    }
                    else if(op === 'MTC0') instBuffer.push(((0x10 << 26) | (0x04 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0);
                    else if(op === 'MFC0') instBuffer.push(((0x10 << 26) | (0x00 << 21) | (parseReg(parts[1]) << 16) | (parseImm(parts[2]) << 11)) >>> 0);
                    else if(op === 'ERET') instBuffer.push(0x42000018);
                    break;
            }

            // --- 核心修复：正确增加 PC ---
            instBuffer.forEach(code => {
                machineCodes.push(code);
                pc += 4;
            });
            
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