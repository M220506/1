import os
import sys
import httpx
from colorama import Fore, init
init(autoreset=True)

fr = Fore.RED
fg = Fore.GREEN
fy = Fore.YELLOW
fw = Fore.WHITE
fre = Fore.RESET

def load_api_list(file_path):
    """Đọc danh sách API từ file"""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            api_list = [line.strip() for line in file if line.strip()]
        return api_list
    except FileNotFoundError:
        print(f"File {file_path} không tồn tại!")
        return []

# Đọc danh sách API từ file api_list.txt
api_file = "api_list.txt"
list = load_api_list(api_file)  # Biến list chứa danh sách API

# In danh sách API đã tải
if list:
    print(f"Đã tải {len(list)} API từ {api_file}:")
    for api in list[:5]:  # Hiển thị 5 API đầu tiên
        print(api)
else:
    print("Không có API nào được tải!")

         

if __name__ == "__main__":
    file = "http.txt"
    
    try:
        if os.path.isfile(file):
            os.system('cls' if os.name == 'nt' else 'clear')
            os.remove(file)
            print("{}File {} removed!\n{}Refreshing proxies...\n".format(fr, file, fy, file))
            with open(file, 'a') as data:
                for proxy in list:
                    data.write(httpx.get(proxy).text)
                    print(" -| Scraped from {}{}".format(fg, proxy))
        else:
            os.system('cls' if os.name == 'nt' else 'clear')
            with open(file, 'a') as data:
                for proxy in list:
                    data.write(httpx.get(proxy).text)
                    print(" -| Scraped from: {}{}".format(fg, proxy))
    
        with open(file, 'r') as count:
            total = sum(1 for line in count)
        print("\n{}( {}{} {}) {}Proxies refreshed.". format(fw, fy, total, fw, fg))
    
    except IndexError:
        sys.exit(1)
        