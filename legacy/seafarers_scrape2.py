from bs4 import BeautifulSoup
import html
import requests
from geopy import Nominatim
from pprint import pprint
import time
import pandas as pd

dict_from_csv = pd.read_csv(r'C:\Users\Bob\PycharmProjects\seafarers\seafarers\flag_urls.csv', header=None, index_col=0, squeeze=True).to_dict()

app = Nominatim(user_agent="tutorial")

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
    url_piece = str(boat_contents[1]['href'])
    complete_url = ' https://www.ilo.org/dyn/seafarers/' + url_piece
    boat_details['ILO URL'] = complete_url
    #print(complete_url)

    r = requests.get(complete_url)
    soup = BeautifulSoup(r.content, 'html.parser')

    table_soup = soup.find_all('table')
    result = []

    for table in table_soup:
        result.extend(table.find_all('p'))

    #boat_details['Fishing Vessel'] = True

    #loop through all the items in the result list and convert them to a string then do the in comparision
    for count, items in enumerate(result):
        if 'Abandonment ID:' in str(items):
            boat_details['Abandonment ID'] = str(result[count].text).split(':')[1].strip()
            break
        else:
            boat_details['Abandonment ID'] = ''

    #if ':' in str(result[1].text):
    name_status = str(result[1].text).split(':')[1].strip()
    #print(name_status)
    if 'fishing vessel' in name_status:
        boat_details['Fishing Vessel'] = True
    else:
        boat_details['Fishing Vessel'] = False

    if name_status[0] == '[': #its a legacy inactive ship
        boat_details['Ship name'] = name_status.split('-')[0][1:].strip()
        if 'Inactive' in name_status:
            boat_details['Ship status'] = 'Inactive'
        elif 'resolved' in name_status:
            boat_details['Ship status'] = 'resolved'

    else:
        if '[' in name_status:
            name = name_status.split('[')[0].strip()
            boat_details['Ship name'] = name

            status = name_status.split('[')[1][:-1].strip()
            if status == 'fishing vessel':
                boat_details['Ship status'] = ''
            else:
                boat_details['Ship status'] = status
        else:
            if 'fishing vessel' in name_status:
                boat_details['Ship name'] = name_status.split('-')[0].strip()
                boat_details['Ship status'] = ''
            else:
                boat_details['Ship name'] = name_status
                boat_details['Ship status'] = ''

    for count, items in enumerate(result):
        if 'Flag:' in str(items):
            boat_details['Flag'] = str(result[count].text).split(':')[1].strip()
            try:
                boat_details['Flag URL'] = dict_from_csv[boat_details['Flag']]
            except:
                boat_details['Flag URL'] = ''
                #print(boat_details['Flag URL'])
            break
        else:
            boat_details['Flag'] = ''

    for count, items in enumerate(result):
        if '7-digit IMO no.:' in str(items):
            boat_details['IMO no.'] = str(result[count].text).split(':')[1].strip()

            boat_details['Vessel Finder Link'] = 'https://www.vesselfinder.com/vessels?name=' + boat_details['IMO no.']

            break
        else:
            boat_details['IMO no.'] = ''

    for count, items in enumerate(result):
        if 'Port of abandonment:' in str(items):
            boat_details['Port of abandonment'] = str(result[count].text).split(':')[1].strip()

            try:
                time.sleep(1)
                location = app.geocode(boat_details['Port of abandonment']).raw
                boat_details['Port latitude'] = location["lat"]
                boat_details['Port longitude'] = location["lon"]
            except:
                boat_details['Port latitude'] = ''
                boat_details['Port longitude'] = ''

            break
        else:
            boat_details['Port of abandonment'] = ''

    for count, items in enumerate(result):
        if 'Abandonment date' in str(items):
            boat_details['Abandonment date'] = str(result[count].text).split(':')[1].strip()
            break
        else:
            boat_details['Abandonment date'] = ''

    for count, items in enumerate(result):
        if 'Notification date' in str(items):
            boat_details['Notification date'] = str(result[count].text).split(':')[1].strip()
            break
        else:
            boat_details['Notification date'] = ''

    for count, items in enumerate(result):
        if 'Reporting Member Govt. or Org.' in str(items):
            boat_details['Reporting Member Govt. or Org.'] = str(result[count].text).split(':')[1].strip()
            break
        else:
            boat_details['Reporting Member Govt. or Org.'] = ''

    for count, items in enumerate(result):
        if 'No. of Seafarers' in str(items):
            boat_details['No. of Seafarers'] = str(result[count].text).split(':')[1].strip()
            break
        else:
            boat_details['No. of Seafarers'] = ''

    # for count, items in enumerate(result):
    #     if 'Nationalities' in str(items):
    #         boat_details['Nationalities'] = str(result[count].text).split(':')[1].strip()
    #         break
    #     else:
    #         boat_details['Nationalities'] = ''

    for count, items in enumerate(result):
        if 'Circumstances' in str(items):

            #first attempt, worked but what if there are ':" in the text of the circumstances
            #boat_details['Circumstances'] = str(result[count].text).split(':')[1].strip()

            #worked but didn't handle line breaks
            #boat_details['Circumstances'] = str(result[count].text)[14:]

            b = html.unescape(str(result[count])[82:-23])
            boat_details['Circumstances'] = b.replace('<br/>','\n')
            break
        else:
            boat_details['Circumstances'] = ''

        for count, items in enumerate(result):
            if 'Comments and Observations' in str(items):

                # first attempt, worked but what if there are ':" in the text of the circumstances
                # boat_details['Circumstances'] = str(result[count].text).split(':')[1].strip()

                # worked but didn't handle line breaks
                boat_details['Comments and Observations Length'] = len(str(result[count].text)[14:])

                #b = html.unescape(str(result[count])[82:-23])
                #boat_details['Comments and Observations Length'] = b.replace('<br/>', '\n')
                break
            else:
                boat_details['Comments and Observations Length'] = ''

    print(boat_details['ILO URL'], '~',
          boat_details['Abandonment ID'], '~',
          boat_details['Fishing Vessel'], '~',
          boat_details['Ship name'], '~',
          boat_details['Ship status'], '~',
          boat_details['Flag'], '~',
          boat_details['Flag URL'], '~',
          boat_details['IMO no.'], '~',
          boat_details['Vessel Finder Link'], '~',
          boat_details['Port of abandonment'], '~',
          boat_details['Port latitude'], '~',
          boat_details['Port longitude'], '~',
          boat_details['Abandonment date'], '~',
          boat_details['Notification date'], '~',
          boat_details['Reporting Member Govt. or Org.'], '~',
          boat_details['No. of Seafarers'], '~',
          #boat_details['Nationalities'], '~',
          boat_details['Circumstances'], '~',
          boat_details['Comments and Observations Length']
          )

    ############## multiple : that must be split on
    #specific_boat_details['Actions taken'] = str(result[11].text).split(':')[1]
    # specific_boat_details['Repatriation status'] = str(result[12].text).split(':')[1]
    # specific_boat_details['Payment status'] = str(result[13].text).split(':')[1]

    detailed_boat_list.append(boat_details.copy())


print(detailed_boat_list)