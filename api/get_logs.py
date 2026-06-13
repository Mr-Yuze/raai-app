from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import json

options = Options()
options.add_argument('--headless')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
driver = webdriver.Chrome(options=options)

try:
    driver.get("http://localhost:5000/")
    time.sleep(2)
    logs = driver.get_log('browser')
    for log in logs:
        print(f"[{log['level']}] {log['message']}")
except Exception as e:
    print("Error:", e)
finally:
    driver.quit()
