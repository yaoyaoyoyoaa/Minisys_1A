## 时钟与复位
set_property PACKAGE_PIN Y18 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]

set_property PACKAGE_PIN P20 [get_ports rst]
set_property IOSTANDARD LVCMOS33 [get_ports rst]

## ----------------------------------------------------------------------------
## 4x4 矩阵键盘管脚 (根据你提供的丝印顺序)
## 假设 L5, J6, K6, M2 为行 (Output)
## 假设 K3, L3, J4, K4 为列 (Input)
## ----------------------------------------------------------------------------

set_property PACKAGE_PIN L5 [get_ports {row[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {row[0]}]

set_property PACKAGE_PIN J6 [get_ports {row[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {row[1]}]

set_property PACKAGE_PIN K6 [get_ports {row[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {row[2]}]

set_property PACKAGE_PIN M2 [get_ports {row[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {row[3]}]

set_property PACKAGE_PIN K3 [get_ports {col[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {col[0]}]

set_property PACKAGE_PIN L3 [get_ports {col[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {col[1]}]

set_property PACKAGE_PIN J4 [get_ports {col[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {col[2]}]

set_property PACKAGE_PIN K4 [get_ports {col[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {col[3]}]

## LED (用于显示测试结果) - 仅列出前4个示例
set_property PACKAGE_PIN A21 [get_ports {leds[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {leds[0]}]
set_property PACKAGE_PIN E22 [get_ports {leds[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {leds[1]}]
set_property PACKAGE_PIN D22 [get_ports {leds[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {leds[2]}]
set_property PACKAGE_PIN E21 [get_ports {leds[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {leds[3]}]
# ... 请补充剩余LED约束 ...