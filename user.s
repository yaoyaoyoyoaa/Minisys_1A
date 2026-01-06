.text
__USER_ENTRY:
  # 用户程序入口：做一些加减运算，然后通过 BIOS 退出
  LI $t0,7
  LI $t1,13
  ADD $t2,$t0,$t1    # 20
  SUB $t3,$t2,$t0    # 13
  ADD $t4,$t2,$t3    # 33
  SUB $t5,$t4,$t1    # 20
  MOVE $v0,$t5       # 返回值放入 $v0
  J __BIOS_EXIT      # 返回 BIOS

  # 补充测试路径（课堂展示用）：分支与访存占位
  LI $s0,2
__U_LOOP:
  BEQZ $s0,__U_END
  ADDIU $s0,$s0,-1
  J __U_LOOP
__U_END:
  NOP
  SW $t0,0($sp)
  LW $t1,0($sp)
  SB $t1,1($sp)
  LB $t2,1($sp)
  SH $t2,2($sp)
  LH $t3,2($sp)
  NOP
  NOP

