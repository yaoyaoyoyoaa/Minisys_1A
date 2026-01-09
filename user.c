// user.c - 严格符合 Mini C 规范的计算器
void main(void)
{
    // 1. 所有变量必须在开头声明 (禁止赋值)
    int is_pressed;
    int key_val;
    int last_key;
    int num;
    int sum;
    int i;
    int key_addr;
    int seg_addr;
    int key_val;
    
    // 必须使用讲义规定的新地址
    key_addr = $0xFFFFFC10; 
    seg_addr = $0xFFFFFC00; // 写低4位地址即可，32位写会覆盖高位
    // 2. 初始化变量
    last_key = 0;
    num = 0;
    sum = 0;

    // 3. 主循环
    while(1)
    {
        // $0xfffffc12 是键盘状态 (bit0=1 按下)
        is_pressed = $0xfffffc12;
        
        if (is_pressed) 
        {
            // $0xfffffc10 是键盘键值
            key_val = $0xfffffc10;
            
            if (key_val != last_key)
            {
                if (key_val < 10) 
                {
                    num = key_val;
                    // $0xffff0010 是数码管
                    $0xffff0010 = num;
                }
                
                // 按下 'A' (10) 键进行加法
                if (key_val == 10)
                {
                    sum = sum + num;
                    $0xffff0010 = sum;
                    num = 0;
                }
                
                last_key = key_val;
            }
        }
        
        // 延时消抖
        i = 2000;
        while(i > 0) {
            i = i - 1;
        }
    }
}