// Real, public ILO records (the three shapes a post has to handle), as they
// come out of load.js. #1636's comments are cut to its newest three updates.

const nikolayMeshkov = {
  abandonment_id: '1821',
  ship_name: 'Nikolay Meshkov',
  ship_status: '',
  flag: 'Palau',
  imo_number: '8862507',
  port_of_abandonment: 'Samsun, Türkiye',
  abandonment_date: '1 July 2026',
  num_seafarers: 13,
  circumstances: 'Owed wages of 3 months. One of the seafarers has been onboard for over a year.\n\nSeafarers applied to insurer?: No \nInsurance certificate dates: 30th March 2025 to 30th September 2026',
  comments: '',
  fishing_vessel: 0,
  ilo_url: 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=1821',
  scraped_at: '2026-09-14T17:53:37.142Z',
};

const bird16 = {
  abandonment_id: '1306',
  ship_name: 'Bird 16',
  ship_status: 'resolved',
  flag: 'Comoros',
  imo_number: '9124201',
  port_of_abandonment: 'Mersin, Türkiye',
  abandonment_date: '1 September 2024',
  num_seafarers: 15,
  circumstances: 'Bangladeshi seafarer has a 9 months outstanding salary and repatriation request. His contract is expired.\n2 Indian Officers have 4 months of unpaid salary.\n\nSeafarers applied to insurer?: No \nInsurance certificate dates: 26th July 2024 to 26th July 2025',
  comments: "15 June 2025: International Transport Workers' Federation\nThe 3 crew members who complained confirmed that they received their outstanding wages. 2 were repatriated and the other seafarers decided he wanted to remain no-board.\nResolved.\n\n\n14 April 2025: International Transport Workers' Federation\nVessel is currently under arrest by PSC in Mersin Port.\nThe 12 Syrians are afraid to talk to us. But they have also not received their wages. Most of them joined the vessel in February and March 2025. The company owner/manager is Friends Shipping company where a number of their vessels have been declared as abandonments",
  fishing_vessel: 0,
  ilo_url: 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=1306',
  scraped_at: '2026-07-10T13:45:29.194Z',
};

const shreenathJi = {
  abandonment_id: '1636',
  ship_name: 'Shreenath Ji',
  ship_status: 'disputed',
  flag: 'Panama',
  imo_number: '9361926',
  port_of_abandonment: 'Dubai, United Arab Emirates',
  abandonment_date: '1 April 2025',
  num_seafarers: 10,
  circumstances: 'Seafarer has not been paid for more than 10 months and the SEA expired end of October 2025.\n\nSeafarers applied to insurer?: No \nInsurance certificate dates: N/A',
  comments: "16 June 2026: International Transport Workers' Federation\nSeafarer has been repatriated without receiving his outstanding wages.\n\nDisputed\n\n\n12 May 2026: Other\n(From the seafarer requesting for the assistance)\n\nThis to informed all that my settlement has been made with my company sea sail shipping in the panama marintime office dubai. Now all my grievances is finished with my company and i would like to withdrawal all my complain back from Sea sail shipping LLC and vessel NAME-MT SHREENATH JI.\nPlease find below the attached settlement letter.\n\n\n8 May 2026: Other\n(From the seafarer requesting for the assistance)\n\nI am writing this email to formally bring to your attention the events that took place today during the office meeting in Tirupati, which was attended by Mr. *** along with the Panama representatives.\nDuring the meeting, it was communicated that my pending salary would be settled on an “as per OS basis”.",
  fishing_vessel: 0,
  ilo_url: 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=1636',
  scraped_at: '2026-09-14T17:53:37.142Z',
};

module.exports = { nikolayMeshkov, bird16, shreenathJi };
