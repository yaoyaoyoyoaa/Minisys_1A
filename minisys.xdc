# =============================================================================
# Minisys-1A (Artix-7 XC7A100T) 适配 minisys_top.v 的约束文件
# =============================================================================

# --- 时钟与复位 ---
# 对应顶层端口: board_clk, board_rst
set_property -dict {PACKAGE_PIN Y18 IOSTANDARD LVCMOS33} [get_ports board_clk]
set_property -dict {PACKAGE_PIN P20 IOSTANDARD LVCMOS33} [get_ports board_rst]

# --- 串口 (USB-UART) ---
# 对应顶层端口: rx, tx
set_property -dict {PACKAGE_PIN Y19 IOSTANDARD LVCMOS33} [get_ports rx]
set_property -dict {PACKAGE_PIN V18 IOSTANDARD LVCMOS33} [get_ports tx]

# --- 蜂鸣器 (Buzzer) ---
# 对应顶层端口: beep_out (注：顶层中没有 pwm_out 端口，而是 beep_out)
set_property -dict {PACKAGE_PIN A19 IOSTANDARD LVCMOS33} [get_ports beep_out]

# --- 按钮 (Buttons) ---
# 对应顶层端口: buttons_in[4:0] (上, 左, 中, 右, 下 - 典型布局)
set_property -dict {PACKAGE_PIN P2 IOSTANDARD LVCMOS33} [get_ports {buttons_in[4]}]
set_property -dict {PACKAGE_PIN P4 IOSTANDARD LVCMOS33} [get_ports {buttons_in[3]}]
set_property -dict {PACKAGE_PIN P5 IOSTANDARD LVCMOS33} [get_ports {buttons_in[2]}]
set_property -dict {PACKAGE_PIN P1 IOSTANDARD LVCMOS33} [get_ports {buttons_in[1]}]
set_property -dict {PACKAGE_PIN R1 IOSTANDARD LVCMOS33} [get_ports {buttons_in[0]}]
# 必要的时钟专用路由约束 (因为复位逻辑使用了按钮)
set_property CLOCK_DEDICATED_ROUTE FALSE [get_nets rst_IBUF]
set_property CLOCK_DEDICATED_ROUTE FALSE [get_nets {buttons_in_IBUF[3]}]

# --- 24个 拨码开关 ---
# 对应顶层端口: switches_in[23:0]
set_property -dict {PACKAGE_PIN W4  IOSTANDARD LVCMOS33} [get_ports {switches_in[0]}]
set_property -dict {PACKAGE_PIN R4  IOSTANDARD LVCMOS33} [get_ports {switches_in[1]}]
set_property -dict {PACKAGE_PIN T4  IOSTANDARD LVCMOS33} [get_ports {switches_in[2]}]
set_property -dict {PACKAGE_PIN T5  IOSTANDARD LVCMOS33} [get_ports {switches_in[3]}]
set_property -dict {PACKAGE_PIN U5  IOSTANDARD LVCMOS33} [get_ports {switches_in[4]}]
set_property -dict {PACKAGE_PIN W6  IOSTANDARD LVCMOS33} [get_ports {switches_in[5]}]
set_property -dict {PACKAGE_PIN W5  IOSTANDARD LVCMOS33} [get_ports {switches_in[6]}]
set_property -dict {PACKAGE_PIN U6  IOSTANDARD LVCMOS33} [get_ports {switches_in[7]}]
set_property -dict {PACKAGE_PIN V5  IOSTANDARD LVCMOS33} [get_ports {switches_in[8]}]
set_property -dict {PACKAGE_PIN R6  IOSTANDARD LVCMOS33} [get_ports {switches_in[9]}]
set_property -dict {PACKAGE_PIN T6  IOSTANDARD LVCMOS33} [get_ports {switches_in[10]}]
set_property -dict {PACKAGE_PIN Y6  IOSTANDARD LVCMOS33} [get_ports {switches_in[11]}]
set_property -dict {PACKAGE_PIN AA6 IOSTANDARD LVCMOS33} [get_ports {switches_in[12]}]
set_property -dict {PACKAGE_PIN V7  IOSTANDARD LVCMOS33} [get_ports {switches_in[13]}]
set_property -dict {PACKAGE_PIN AB7 IOSTANDARD LVCMOS33} [get_ports {switches_in[14]}]
set_property -dict {PACKAGE_PIN AB6 IOSTANDARD LVCMOS33} [get_ports {switches_in[15]}]
set_property -dict {PACKAGE_PIN V9  IOSTANDARD LVCMOS33} [get_ports {switches_in[16]}]
set_property -dict {PACKAGE_PIN V8  IOSTANDARD LVCMOS33} [get_ports {switches_in[17]}]
set_property -dict {PACKAGE_PIN AA8 IOSTANDARD LVCMOS33} [get_ports {switches_in[18]}]
set_property -dict {PACKAGE_PIN AB8 IOSTANDARD LVCMOS33} [get_ports {switches_in[19]}]
set_property -dict {PACKAGE_PIN Y8  IOSTANDARD LVCMOS33} [get_ports {switches_in[20]}]
set_property -dict {PACKAGE_PIN Y7  IOSTANDARD LVCMOS33} [get_ports {switches_in[21]}]
set_property -dict {PACKAGE_PIN W9  IOSTANDARD LVCMOS33} [get_ports {switches_in[22]}]
set_property -dict {PACKAGE_PIN Y9  IOSTANDARD LVCMOS33} [get_ports {switches_in[23]}]

# --- 24个 LED (三色分组) ---
# 对应顶层端口: led_GLD_out (绿), led_YLD_out (黄), led_RLD_out (红)

# 绿灯 (GLD0-7) -> 对应原来的 leds[0-7]
set_property -dict {PACKAGE_PIN A21 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[0]}]
set_property -dict {PACKAGE_PIN E22 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[1]}]
set_property -dict {PACKAGE_PIN D22 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[2]}]
set_property -dict {PACKAGE_PIN E21 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[3]}]
set_property -dict {PACKAGE_PIN D21 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[4]}]
set_property -dict {PACKAGE_PIN G21 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[5]}]
set_property -dict {PACKAGE_PIN G22 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[6]}]
set_property -dict {PACKAGE_PIN F21 IOSTANDARD LVCMOS33} [get_ports {led_GLD_out[7]}]

# 黄灯 (YLD0-7) -> 对应原来的 leds[8-15]
set_property -dict {PACKAGE_PIN J17 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[0]}]
set_property -dict {PACKAGE_PIN L14 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[1]}]
set_property -dict {PACKAGE_PIN L15 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[2]}]
set_property -dict {PACKAGE_PIN L16 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[3]}]
set_property -dict {PACKAGE_PIN K16 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[4]}]
set_property -dict {PACKAGE_PIN M15 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[5]}]
set_property -dict {PACKAGE_PIN M16 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[6]}]
set_property -dict {PACKAGE_PIN M17 IOSTANDARD LVCMOS33} [get_ports {led_YLD_out[7]}]

# 红灯 (RLD0-7) -> 对应原来的 leds[16-23]
set_property -dict {PACKAGE_PIN N19 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[0]}]
set_property -dict {PACKAGE_PIN N20 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[1]}]
set_property -dict {PACKAGE_PIN M20 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[2]}]
set_property -dict {PACKAGE_PIN K13 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[3]}]
set_property -dict {PACKAGE_PIN K14 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[4]}]
set_property -dict {PACKAGE_PIN M13 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[5]}]
set_property -dict {PACKAGE_PIN L13 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[6]}]
set_property -dict {PACKAGE_PIN K17 IOSTANDARD LVCMOS33} [get_ports {led_RLD_out[7]}]

# --- 4x4 矩阵键盘 ---
# 对应顶层端口: keyboard_rows_out, keyboard_cols_in

# 行线 Row (输出)
set_property -dict {PACKAGE_PIN L5 IOSTANDARD LVCMOS33} [get_ports {keyboard_rows_out[3]}]
set_property -dict {PACKAGE_PIN J6 IOSTANDARD LVCMOS33} [get_ports {keyboard_rows_out[2]}]
set_property -dict {PACKAGE_PIN K6 IOSTANDARD LVCMOS33} [get_ports {keyboard_rows_out[1]}]
set_property -dict {PACKAGE_PIN M2 IOSTANDARD LVCMOS33} [get_ports {keyboard_rows_out[0]}]

# 列线 Col (输入，必须保留上拉 PULLUP)
set_property -dict {PACKAGE_PIN K3 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {keyboard_cols_in[3]}]
set_property -dict {PACKAGE_PIN L3 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {keyboard_cols_in[2]}]
set_property -dict {PACKAGE_PIN J4 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {keyboard_cols_in[1]}]
set_property -dict {PACKAGE_PIN K4 IOSTANDARD LVCMOS33 PULLUP true} [get_ports {keyboard_cols_in[0]}]

# --- 7段数码管 ---
# 对应顶层端口: digits_sel_out, digits_data_out

# 位选 digits_sel_out (Anodes)
set_property -dict {PACKAGE_PIN C19 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[0]}]
set_property -dict {PACKAGE_PIN E19 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[1]}]
set_property -dict {PACKAGE_PIN D19 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[2]}]
set_property -dict {PACKAGE_PIN F18 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[3]}]
set_property -dict {PACKAGE_PIN E18 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[4]}]
set_property -dict {PACKAGE_PIN B20 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[5]}]
set_property -dict {PACKAGE_PIN A20 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[6]}]
set_property -dict {PACKAGE_PIN A18 IOSTANDARD LVCMOS33} [get_ports {digits_sel_out[7]}]

# 段选 digits_data_out (Segments)
set_property -dict {PACKAGE_PIN F15 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[0]}]
set_property -dict {PACKAGE_PIN F13 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[1]}]
set_property -dict {PACKAGE_PIN F14 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[2]}]
set_property -dict {PACKAGE_PIN F16 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[3]}]
set_property -dict {PACKAGE_PIN E17 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[4]}]
set_property -dict {PACKAGE_PIN C14 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[5]}]
set_property -dict {PACKAGE_PIN C15 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[6]}]
set_property -dict {PACKAGE_PIN E13 IOSTANDARD LVCMOS33} [get_ports {digits_data_out[7]}]