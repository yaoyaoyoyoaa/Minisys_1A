# =============================================================================
# Minisys-1A (Artix-7 XC7A100T) 完整约束文件
# =============================================================================

# --- 时钟与复位 ---
set_property -dict {PACKAGE_PIN Y18 IOSTANDARD LVCMOS33} [get_ports clk]
set_property -dict {PACKAGE_PIN P20 IOSTANDARD LVCMOS33} [get_ports rst]

# --- 串口 (USB-UART) ---
set_property -dict {PACKAGE_PIN Y19 IOSTANDARD LVCMOS33} [get_ports uart_rx]
set_property -dict {PACKAGE_PIN V18 IOSTANDARD LVCMOS33} [get_ports uart_tx]

# --- 蜂鸣器 / PWM ---
# 对应讲义 1.4.6 节 A19 管脚
set_property -dict {PACKAGE_PIN A19 IOSTANDARD LVCMOS33} [get_ports pwm_out]

# --- 24个 拨码开关 (Switches) ---
# 对应讲义 表3-1
set_property -dict {PACKAGE_PIN W4  IOSTANDARD LVCMOS33} [get_ports {switches[0]}]
set_property -dict {PACKAGE_PIN R4  IOSTANDARD LVCMOS33} [get_ports {switches[1]}]
set_property -dict {PACKAGE_PIN T4  IOSTANDARD LVCMOS33} [get_ports {switches[2]}]
set_property -dict {PACKAGE_PIN T5  IOSTANDARD LVCMOS33} [get_ports {switches[3]}]
set_property -dict {PACKAGE_PIN U5  IOSTANDARD LVCMOS33} [get_ports {switches[4]}]
set_property -dict {PACKAGE_PIN W6  IOSTANDARD LVCMOS33} [get_ports {switches[5]}]
set_property -dict {PACKAGE_PIN W5  IOSTANDARD LVCMOS33} [get_ports {switches[6]}]
set_property -dict {PACKAGE_PIN U6  IOSTANDARD LVCMOS33} [get_ports {switches[7]}]
set_property -dict {PACKAGE_PIN V5  IOSTANDARD LVCMOS33} [get_ports {switches[8]}]
set_property -dict {PACKAGE_PIN R6  IOSTANDARD LVCMOS33} [get_ports {switches[9]}]
set_property -dict {PACKAGE_PIN T6  IOSTANDARD LVCMOS33} [get_ports {switches[10]}]
set_property -dict {PACKAGE_PIN Y6  IOSTANDARD LVCMOS33} [get_ports {switches[11]}]
set_property -dict {PACKAGE_PIN AA6 IOSTANDARD LVCMOS33} [get_ports {switches[12]}]
set_property -dict {PACKAGE_PIN V7  IOSTANDARD LVCMOS33} [get_ports {switches[13]}]
set_property -dict {PACKAGE_PIN AB7 IOSTANDARD LVCMOS33} [get_ports {switches[14]}]
set_property -dict {PACKAGE_PIN AB6 IOSTANDARD LVCMOS33} [get_ports {switches[15]}]
set_property -dict {PACKAGE_PIN V9  IOSTANDARD LVCMOS33} [get_ports {switches[16]}]
set_property -dict {PACKAGE_PIN V8  IOSTANDARD LVCMOS33} [get_ports {switches[17]}]
set_property -dict {PACKAGE_PIN AA8 IOSTANDARD LVCMOS33} [get_ports {switches[18]}]
set_property -dict {PACKAGE_PIN AB8 IOSTANDARD LVCMOS33} [get_ports {switches[19]}]
set_property -dict {PACKAGE_PIN Y8  IOSTANDARD LVCMOS33} [get_ports {switches[20]}]
set_property -dict {PACKAGE_PIN Y7  IOSTANDARD LVCMOS33} [get_ports {switches[21]}]
set_property -dict {PACKAGE_PIN W9  IOSTANDARD LVCMOS33} [get_ports {switches[22]}]
set_property -dict {PACKAGE_PIN Y9  IOSTANDARD LVCMOS33} [get_ports {switches[23]}]

# --- 24个 LED ---
# 对应讲义 表3-1
# 绿灯 (GLD0-7) -> leds[0-7]
set_property -dict {PACKAGE_PIN A21 IOSTANDARD LVCMOS33} [get_ports {leds[0]}]
set_property -dict {PACKAGE_PIN E22 IOSTANDARD LVCMOS33} [get_ports {leds[1]}]
set_property -dict {PACKAGE_PIN D22 IOSTANDARD LVCMOS33} [get_ports {leds[2]}]
set_property -dict {PACKAGE_PIN E21 IOSTANDARD LVCMOS33} [get_ports {leds[3]}]
set_property -dict {PACKAGE_PIN D21 IOSTANDARD LVCMOS33} [get_ports {leds[4]}]
set_property -dict {PACKAGE_PIN G21 IOSTANDARD LVCMOS33} [get_ports {leds[5]}]
set_property -dict {PACKAGE_PIN G22 IOSTANDARD LVCMOS33} [get_ports {leds[6]}]
set_property -dict {PACKAGE_PIN F21 IOSTANDARD LVCMOS33} [get_ports {leds[7]}]
# 黄灯 (YLD0-7) -> leds[8-15]
set_property -dict {PACKAGE_PIN J17 IOSTANDARD LVCMOS33} [get_ports {leds[8]}]
set_property -dict {PACKAGE_PIN L14 IOSTANDARD LVCMOS33} [get_ports {leds[9]}]
set_property -dict {PACKAGE_PIN L15 IOSTANDARD LVCMOS33} [get_ports {leds[10]}]
set_property -dict {PACKAGE_PIN L16 IOSTANDARD LVCMOS33} [get_ports {leds[11]}]
set_property -dict {PACKAGE_PIN K16 IOSTANDARD LVCMOS33} [get_ports {leds[12]}]
set_property -dict {PACKAGE_PIN M15 IOSTANDARD LVCMOS33} [get_ports {leds[13]}]
set_property -dict {PACKAGE_PIN M16 IOSTANDARD LVCMOS33} [get_ports {leds[14]}]
set_property -dict {PACKAGE_PIN M17 IOSTANDARD LVCMOS33} [get_ports {leds[15]}]
# 红灯 (RLD0-7) -> leds[16-23]
set_property -dict {PACKAGE_PIN N19 IOSTANDARD LVCMOS33} [get_ports {leds[16]}]
set_property -dict {PACKAGE_PIN N20 IOSTANDARD LVCMOS33} [get_ports {leds[17]}]
set_property -dict {PACKAGE_PIN M20 IOSTANDARD LVCMOS33} [get_ports {leds[18]}]
set_property -dict {PACKAGE_PIN K13 IOSTANDARD LVCMOS33} [get_ports {leds[19]}]
set_property -dict {PACKAGE_PIN K14 IOSTANDARD LVCMOS33} [get_ports {leds[20]}]
set_property -dict {PACKAGE_PIN M13 IOSTANDARD LVCMOS33} [get_ports {leds[21]}]
set_property -dict {PACKAGE_PIN L13 IOSTANDARD LVCMOS33} [get_ports {leds[22]}]
set_property -dict {PACKAGE_PIN K17 IOSTANDARD LVCMOS33} [get_ports {leds[23]}]

# --- 4x4 矩阵键盘 (还原为正确方向) ---

# 行线 Row (输出扫描) - 使用 L5, J6...
set_property -dict {PACKAGE_PIN L5 IOSTANDARD LVCMOS33} [get_ports {row[3]}]
set_property -dict {PACKAGE_PIN J6 IOSTANDARD LVCMOS33} [get_ports {row[2]}]
set_property -dict {PACKAGE_PIN K6 IOSTANDARD LVCMOS33} [get_ports {row[1]}]
set_property -dict {PACKAGE_PIN M2 IOSTANDARD LVCMOS33} [get_ports {row[0]}]

# 列线 Col (输入检测) - 使用 K3, L3... 【必须保留 PULLUP true】
set_property -dict {PACKAGE_PIN K3 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {col[3]}]
set_property -dict {PACKAGE_PIN L3 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {col[2]}]
set_property -dict {PACKAGE_PIN J4 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {col[1]}]
set_property -dict {PACKAGE_PIN K4 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {col[0]}]

# --- 7段数码管 ---
# 对应讲义 1.4.4节 (EGO1/Minisys 典型引脚)
# 数码管位选 (Anodes: AN0-AN7) - 低电平有效
set_property -dict {PACKAGE_PIN C19 IOSTANDARD LVCMOS33} [get_ports {an_out[0]}]
set_property -dict {PACKAGE_PIN E19 IOSTANDARD LVCMOS33} [get_ports {an_out[1]}]
set_property -dict {PACKAGE_PIN D19 IOSTANDARD LVCMOS33} [get_ports {an_out[2]}]
set_property -dict {PACKAGE_PIN F18 IOSTANDARD LVCMOS33} [get_ports {an_out[3]}]
set_property -dict {PACKAGE_PIN E18 IOSTANDARD LVCMOS33} [get_ports {an_out[4]}]
set_property -dict {PACKAGE_PIN B20 IOSTANDARD LVCMOS33} [get_ports {an_out[5]}]
set_property -dict {PACKAGE_PIN A20 IOSTANDARD LVCMOS33} [get_ports {an_out[6]}]
set_property -dict {PACKAGE_PIN A18 IOSTANDARD LVCMOS33} [get_ports {an_out[7]}]

# 数码管段选 (Segments: CA-CG, DP) - 低电平有效
# 假设 seg_out[0]对应CA(a), seg_out[7]对应DP(h)
set_property -dict {PACKAGE_PIN F15 IOSTANDARD LVCMOS33} [get_ports {seg_out[0]}] 
set_property -dict {PACKAGE_PIN F13 IOSTANDARD LVCMOS33} [get_ports {seg_out[1]}]
set_property -dict {PACKAGE_PIN F14 IOSTANDARD LVCMOS33} [get_ports {seg_out[2]}]
set_property -dict {PACKAGE_PIN F16 IOSTANDARD LVCMOS33} [get_ports {seg_out[3]}]
set_property -dict {PACKAGE_PIN E17 IOSTANDARD LVCMOS33} [get_ports {seg_out[4]}]
set_property -dict {PACKAGE_PIN C14 IOSTANDARD LVCMOS33} [get_ports {seg_out[5]}]
set_property -dict {PACKAGE_PIN C15 IOSTANDARD LVCMOS33} [get_ports {seg_out[6]}]
set_property -dict {PACKAGE_PIN E13 IOSTANDARD LVCMOS33} [get_ports {seg_out[7]}]