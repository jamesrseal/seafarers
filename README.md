# Abandoned Seafarers

## Introduction
Hi, my name is James. I work as a digital consultant and run my own company, [Dare Mighty Data Solutions](www.daremightydata.com). At Dare Mighty Data our ethos is that we seek to help companies in their digital transformation process by enabling them to use all of the tools and technologies at their disposal to the maximum effect. 

This project spawned from an idea I had after reading a blog post on [Jalopnik](https://jalopnik.com/crew-of-ever-given-really-dont-want-to-spend-years-stuc-1846730643) and the quoted [Guardian](https://www.theguardian.com/environment/2021/apr/19/ever-given-crew-fear-joining-ranks-of-seafarers-stranded-on-ships-for-years) article.

As mentioned in the articles, the [ILO](https://www.ilo.org/dyn/seafarers/seafarersBrowse.list?p_lang=en) maintains a database of cases of abandoned seafarers. I got sucked into reading and learning about all of the different abandoned seafarers and ships around the world but I felt like the presentation of the information was lacking. Wouldn't it be neat to have a dashboard that showed where all of the ships were across the globe and their status according to the ILO. With that thought in mind I set out to make that dashboard.
 
[Abandoned Seafarers Dashboard](https://abandoned-seafarers.herokuapp.com/)
 
## How to use the scripts
Below are a list of the main scripts I used to create this dashboard

### seafarers_scrape2.py
Using the great web scraping library [Beautiful Soup](https://www.crummy.com/software/BeautifulSoup/bs4/doc/) I scraped the ILO Seafarers Database website and put the information into a python dictonary. Currently, if I want to get the lastest data I need to manually run this script. In the future I'm interested in scheduling this but want to understand the load it will put on the ILO database.

The ILO database doesn't contain specific latitude and longitude coordinates about where the ships were abandoned but it does list the port of abandonment. We'll need this information if we want to plot the ships on a map. I'm using the [Nominatim package](https://wiki.openstreetmap.org/wiki/Nominatim) that's part of OpenStreetMap in conjunction with the ILO port of abandonment to generate lat/lon coordinates for all of the ships in the ILO database.

Finally, the ILO database also lists the ship's [IMO numbeer](https://en.wikipedia.org/wiki/IMO_number). Plugging a ship's IMO number into [Vessel Finder](https://www.vesselfinder.com/vessels) provides additional information about a ship at any given moment. For each ship in the ILO database I also get the Vessel Finder link for that specific ship.

### cleand_ports_list.csv
For some ports listed in the ILO database the Nominatim package cannot find the specific location or returns incorrect lat/lon coordinates. For those ports with missing or incorrect lat/lon coordinates I manually found the correct lat/lon coordinates and included them in a .csv file which is used in conjunction with the following script.

### clean_data.py
This script takes the cleand_ports_list.csv file and updates the dictionary created by seafarers_scrape2.py to update or correct those ports with incorrect or missing lat/lon values.

### app.py
This is the package responsible for creating the [Abandoned Seafarers Dashboard](https://abandoned-seafarers.herokuapp.com/). As discussed, all of the data scraping and cleansing has been done in Python up to this point. Originally I planned to export this data and develop a dashboard in Tableau (which I have a lot of experience with) however I wanted to challenge myself and learn some new tools so I decided to create the dashboard in Python using [Dash](https://dash.plotly.com/).

In addition to the documentation and tutorials provided by Dash I found this article from realpython.com to be very helpful in learning basic mechanics to setting up a dashboard (https://realpython.com/python-dash/). The article not only provides a good tutorial on the python code, it also provides a .css template that I levraged and also explains how to deploy the dash app using [heroku](https://www.heroku.com/).

## Future Steps
In the future I may explore scheduling seafarers_scrape2.py to automatically scrape the ILO database so as new ships are added my dashboard is always current.

## Conclusion & Contact
In the end this was a fun project that I was able to knock out fairly quickly. I enjoyed learning more about Dash and heroku and plan on using these skills in the future for other interactive dashboard projects.

If you'd like to learn more about me or my company, Dare Mighty Data Solutions, please visit my [website](www.daremightydata.com) or contact me via [email](james@daremightydata.com).
