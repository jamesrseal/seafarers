from bs4 import BeautifulSoup
import requests
import pandas as pd

url = 'http://ilo.org/dyn/seafarers/seafarersbrowse.details?p_lang=en&p_abandonment_id=137&p_search_id=210421203010'
#url = 'https://www.google.com'
specific_boat_details = {}

r = requests.get(url)
#print(r.content[:100])

soup = BeautifulSoup(r.content, 'html.parser')
#print(soup.prettify())

# td_soup = soup.find_all('td')  # Grab the first table
# text = 'Flag:'
#
# for i in td_soup:
#     if(i.string == text):
#         print(i)
#         for j in i.children:
#             print(j)

table_soup = soup.find_all('table')
result = []
for table in table_soup:
    result.extend(table.find_all('p'))

specific_boat_details['Abandonment ID'] = str(result[0].text).split(':')[1]

name_status = str(result[1].text).split(':')[1]
name = name_status.split('[')[0]
status = name_status.split('[')[1][:-1]
specific_boat_details['Ship name'] = name
specific_boat_details['Ship status'] = str(result[1].text).split(':')[1] = status

specific_boat_details['Flag'] = str(result[2].text).split(':')[1]
specific_boat_details['IMO no.'] = str(result[3].text).split(':')[1]
specific_boat_details['Port of abandonment'] = str(result[4].text).split(':')[1]
specific_boat_details['Abandonment date'] = str(result[5].text).split(':')[1]
specific_boat_details['Notification date'] = str(result[6].text).split(':')[1]
specific_boat_details['Reporting Member Govt. or Org.'] = str(result[7].text).split(':')[1]
specific_boat_details['No. of Seafarers'] = str(result[8].text).split(':')[1]
specific_boat_details['Nationalities'] = str(result[9].text).split(':')[1]
specific_boat_details['Circumstances'] = str(result[10].text).split(':')[1]

############## multiple : that must be split on
# specific_boat_details['Actions taken'] = str(result[11].text).split(':')[1]
# specific_boat_details['Repatriation status'] = str(result[12].text).split(':')[1]
# specific_boat_details['Payment status'] = str(result[13].text).split(':')[1]
# specific_boat_details['Comments and Observations'] = str(result[14].text).split(':')[1]


print(specific_boat_details)

# new_table = pd.DataFrame(columns=range(0, 2), index=[0])  # I know the size
#
# row_marker = 0
# for row in table.find_all('tr'):
#     column_marker = 0
#     columns = row.find_all('td')
#     for column in columns:
#         new_table.iat[row_marker, column_marker] = column.get_text()
#         column_marker += 1


######use the
# r = requests.get(url)
# # print(r.content[:100])
#
# soup = BeautifulSoup(r.content, 'html.parser')
# # print(soup.prettify())
#
# boat_list = soup.find_all('p')  # soup of all items wrapped in a p tag
#
# for boats in boat_list:  # for all the items wrapped in a p tag, extract their contents
#     boat_contents = boats.contents  # gets a list of the items that are wrapped in a p tag
#
#     boat_detail_url = boat_contents[1]['href']  # gets url for more info
#
#     s = requests.get(boat_detail_url)
#     soup = BeautifulSoup(s.content, 'html.parser')