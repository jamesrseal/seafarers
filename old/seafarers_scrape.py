from bs4 import BeautifulSoup
import requests

url = 'http://ilo.org/dyn/seafarers/seafarersBrowse.list'
#url = 'https://www.google.com'

counter = 0
boat_details = {}
detailed_boat_list = []

r = requests.get(url)
#print(r.content[:100])

soup = BeautifulSoup(r.content, 'html.parser')
#print(soup.prettify())

boat_list = soup.find_all('p') #soup of all items wrapped in a p tag

for boats in boat_list: #for all the items wrapped in a p tag, extract their contents
    boat_contents = boats.contents #gets a list of the items that are wrapped in a p tag

    #boat_details['Link'] = boat_contents[1]
    link = boat_contents[1]
    boat_details['url'] = link['href'] #gets url for more info


    #boat_details['Boat Name'] = str(link.next_element.contents[0])[1:-1]
    #boat_details['Boat Status'] = link.next_element.contents[1].string

    if ' \nFlag: ' in boat_contents:
        boat_details['Flag'] = str(boat_contents[boat_contents.index(' \nFlag: ')+1])[3:-4]
    else:
        boat_details['Flag'] = ''

    if '; Abandoned: ' in boat_contents:
        boat_details['Abandoned'] = True
        boat_details['Abandoned Date'] = str(boat_contents[boat_contents.index('; Abandoned: ')+1])[3:-4]
    else:
        boat_details['Abandoned'] = False
        boat_details['Abandoned Date'] = ''

    if '; Notified: ' in boat_contents:
        boat_details['Notified'] = True
        boat_details['Notified Date'] = str(boat_contents[boat_contents.index('; Notified: ')+1])[3:-4]
    else:
        boat_details['Notified'] = False
        boat_details['Notified Date'] = ''

    if 'Port of abandonment: ' in boat_contents:
        boat_details['Notified'] = True
        boat_details['Port of Abandonment'] = str(boat_contents[boat_contents.index('Port of abandonment: ')+1])[3:-4]
    else:
        boat_details['Notified'] = False
        boat_details['Port of Abandonment'] = ''

    if '; Reported by: ' in boat_contents:
        boat_details['Reported by'] = str(boat_contents[boat_contents.index('; Reported by: ')+1])[3:-4]
    else:
        boat_details['Reported by'] = ''

    detailed_boat_list.append(boat_details.copy())
print(detailed_boat_list[len(detailed_boat_list)-1])

