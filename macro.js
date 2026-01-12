/* macro.js - 宏指令定义 */
(function() {
    window.MiniSys = window.MiniSys || {};

    window.MiniSys.Macros = {
        expansionRules: {
            push: {
                pattern: /^push\s+(\$\w+)$/i,
                replacer: (m) => [`addi $sp, $sp, -4`, `sw ${m[1]}, 0($sp)`]
            },
            pop: {
                pattern: /^pop\s+(\$\w+)$/i,
                replacer: (m) => [`lw ${m[1]}, 0($sp)`, `addi $sp, $sp, 4`]
            },
            // move $t0, $t1 -> addu $t0, $0, $t1
            move: {
                pattern: /^move\s+(\$\w+),\s*(\$\w+)$/i,
                replacer: (m) => [`addu ${m[1]}, $0, ${m[2]}`]
            },
            // li $t0, 100 -> addiu $t0, $0, 100 (简单版)
            // 复杂版 li 会由 assembler 进一步处理
            li_simple: {
                pattern: /^li\s+(\$\w+),\s*(-?\d+|0x[\da-f]+)$/i,
                replacer: (m) => [`addiu ${m[1]}, $0, ${m[2]}`] // 仅限 16位 立即数
            }
        }
    };
})();