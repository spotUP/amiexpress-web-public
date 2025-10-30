#include <iostream>
#include <fstream>
#include <vector>
#include <iomanip>

int main() {
    std::ifstream rom("~/Code/amiexpress-web/roms/kickstart-1.3.rom", std::ios::binary);
    std::vector<uint8_t> data((std::istreambuf_iterator<char>(rom)), std::istreambuf_iterator<char>());
    
    // Address 0xf83632 - ROM base 0xf80000 = offset 0x3632
    uint32_t addr = 0xf83632 - 0xf80000;
    
    std::cout << "ROM bytes at offset 0x" << std::hex << addr << " (address 0xf83632):" << std::endl;
    for (int i = -16; i <= 32; i += 2) {
        uint32_t offset = addr + i;
        if (offset < data.size() - 1) {
            uint16_t word = (data[offset] << 8) | data[offset + 1];
            std::cout << "  0x" << std::hex << std::setw(6) << std::setfill('0') << (0xf80000 + offset) 
                      << ": " << std::setw(4) << word << std::endl;
        }
    }
    
    return 0;
}
