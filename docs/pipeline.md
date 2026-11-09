# Pipeline & Roadmap (Excalidraw extract)

Dakota vs Classicial Machine Learning    Methodology
Portfolio    To Do  / Parsing  / Tip Channels, $OLA, $AAPL, $TSLA - making / sure all tips for stocks in portfolio are parsed  / News & Socials. - use a light-weight scraper,  / X - trending, hashtags, #AAPL, Reddit - API / exists, if yes then is it free?  / Inference  / - indicators (use mathematical models, avoid / LLMs with numbers). #can use jev  / - news, tips and other natural language (use / LLMs) / - classification, using numbers and NLP based / on buy, short, sell, p&d, - Jev  / - Reasoning (Gemini, Local (Hermes or OMP), / Deepseek)  / - Final Inference - based on scores and other / stuff, local vanilla, lightweight.  / Datasets  / meri problem nahi hai     Choose dataset, either get the same dataset from the / papers if available or get the models from the papers (or / make your own according to them) and apply it on the pre- / existing NSE/BSE dataset (no live data required)
Law of diminishing returns     Latest research paper  / - CNN, -CBAM, -LSDM, -AVAE
 Dakota  / my name jev 
TSLA Manipulated    CIte all / sources around / documented / events of / market / manipulation, / get a database / that has / information / about market / manipulation or / MAKE YOUR / OWN!!    #make your own ->  / TSLA manipulate, around 17-10-2026 / (documented) -- find valid and binding / journals or news articles for such / documentations, (twitters and shit / wont work)  / get the data of the stock around the / manipulation timeline and mark it!  / get the data of twt, reddit, news / around that time!  / put it in a combined dataset for / training. 
Watcher watches socials, / stock and news in paralell
Efficiency    Stock + Index    - Indicator and / Graph patterns     #CHoose event
- using high freq / data    Classical ML | Jev / both trained on the same / data
Instead of relying on CML models, / it uses Jev to classify indiciatros / and other data inputs 
Historical Patterns taken / into consideration     Data + Social media / inference     Instead of relying on random stocks and shit, choose actual market manipulation / events and train the model and test the model on said dataset.  / Training | Testing | Validation. ALL THREE MUST BE CARRIED OUT ON DIFFERENT / DATASETS. !!!!!!!!!!  / NSE data -> 60% training, 20% for validating and 10% for testing, (use a better / metric mai toh aise hi bol raha hu). 
Watcher     problems - individual / parameters and time- / series monitoring very / compute heavy and noisy
User can also send tips
Compute cost    News    Tip + Telegram Channels 
Social Media    Member of tip / channels  / 10-11 channels / + any channels the / user is a part of  /     Accuracy - 84%, Precision - 86%
OLA    Validation and Testing get / the score and paper likho!!!
Twitter    Specifically for data projections and / other stuff, not purpose-built for market / manipulation.  / Find classical ML papers based on market / manipulation too!!!!! 
Reddit    Natural Message = Index
Deepseek flash for inference  / or Gemini 3.7 flash-lite  / OMP, Hermes qwen 9b  > opus 5.5 / Classification - JEV.  / Reasoning 3.7 flash lite, / deepseek.     Comparision parameters / latency | Accuracy | F1-Score | Compute power | Compute / cost 
Inference: Reward basis  / suo moto hypothesis (Short, buy, sell)  / - how many tip channels reaffirm it? / - indicators confirm it ? - Jev (hyper-fast classifier)  / - whether the news confirms it? - LLMs + Reasoning / - Whether the current social trends reaffirm it?
Take their accuracy, precision and / methadology (compare CNNs, LSDMs, AVAEs / and other implementations independently)     Research paper ka process  / - Ask the research question: "Comparision of accuracy and precision scores between Hyper- / Fast classifiers like Jev and CNNs (Or other ML models) in detecting market manipulation.  / "Realising the performance of system one models like Jev when paired with Stock data and / Social Media & News sentiment analysis for market manipuilation detection and comparing the / results to the accuracy scores of classical AI models"  / - Analyzing and studying the effect in accuracy scores when System one models like Jev are / paired with Social Media sentiment analysis for stock market manipualtion and comparing the / findings without social media analysis and to classical models / Identify a control group - Jev, with same data, and no social media or news access (compare / your accuracy across all three)  / 
Acc and Prec of  / CNN / LSDM / AVAE    Report all findings in a well-written and well-cited research paper. 
Confidence score 
#TODO / - Take NSE ka dataset, run documented verificaiton on manipulation events, and get the social media history / and activity during that timeline along with the data and other details which are required for Dakota and put / that in a new combined dataset that is informing the model of both the raw stock data along with the news / data.  - task potty aa gyi / - split the dataset into training, testing validation accoridng to proper standards and ratios -- Divisha / - Train Dakota and CML models (all, CNN, LSDM, AVAE) on one common dataset  / - get accuracy, precision and other scores from all models along with dakota  -- Vaihab (Makkar hai)  / 
GITHUB BASICS    PLEASE UNDERSTAND THEIR METHODOLOGY 
Generate an Inference 
BitHub    POtty aa gyi / - scrape older tweets, reddit posts and other stuff, find a way to filter based / on time and gettin data / - take a solid base of 500-600 stock options, monitor their social media / coverage throughout a chosen timespan (say, 12 months (tentatively)), and / merge their BSE data along with social media + news data throughout that / timeframe  / #potty ki bhi potty aa gyi  / 1.) Decide a sample of 400-500 listed companies on BSE jiska data available / ho!!, and take those as well which have had documented cases of market / manipulaiton in the past year, or whichever timeframe you find apt.  / 2.) uske baad un companies ki uprani news scrape karo for the past 1 year - / Divisha ki job.  / 3.) uss companies ke related Reddit posts trhoughout the past 12 months / nikaalo,  / 4.) same cheez ke past tweets in the past 12 months nikaalo / combine that into one godly database and voila. !!!!!
Anant's copy of / Repo    Repo. (google drive folder) 
#Main, / #Master
Branching
GIthub Pages (GP)  / Static Computer - it wont / update anything, it wont / serve live data, it will only / host static (HTML, CSS) / files.     Database
Updates    #Aiven  / drag and drop / your schema / files, select your / service (SQLite). / and it will give / you the backend / link. 
Bug fixes
Backend    Aiven (SQLite / server)
Mesra / (HTML, GP)    Jaipur, DB, Cloud, / Compute. 
Merge    AWS talks to Aiven to / get the query. 
#Merge -> By raising a PR (Pull Request)    Frontend 
Permission from a / contributor in the / upstream repo     For computation, Note / storage we use AWS. !!!!
#TODO / ## Database work / Create a table schema, for the classroom info and everything, and add that to / the git repo.  / add that table as a new table in the aiven dashboard.  / ## Edit ananttheacharya/BitHUb-Jaipur and add the new queries in the / backend of BitHub Jaipur. and merge them into the AWS instance.  / ## add those options, buttons and UI in the frontend.  / frontend - koi nahi karega.  / Database work -- Tum dono, isko GitHUb pe daaldo fatafat.  / Backend Logic- add new files and backend logic to query the database 
Pull - cloning the repository in your own enviornment.  / Push - uploading our changes to the repository  / Commit - local or cloud, pushing each change to the repo.  / Branching - creating a new sup directory or a branch from the upstream / or main branch ofa repo / forking - creating a brand new repo with the same codebase of the / upstream repo.  / Merging - syincing or merging your changes from a fork or a branch into / your upstream repo. 
## FOr backend logic  / - use MySQL connector or pymysql / and query the database to find a / free classroom, a free faculty at a / specific point in time, and any other / feature which patty has designed / the Database 
Anant    Ak Shat
Outreach
#understand with the client, who they / are.  / Dreamer: show them a dream, draw a / vivid picture, dreamers will be very / forward towards full automation and be / wowed by the idea of a jarvis like super / computer.  / Enthusiasts:  will be slightly skeptical of / Lear but ai forward and either because / of lack of knowledge, trust or whatever, / would like to see how lear diagnosis / fixes, they dont want a dream scenario / where an agent is doing everything, they / want something that helps with the infra / pessimistic : people who dont care for / AI, people who dont really trust AI code / in their codebase, people who actually / are busy, old, or just think classically, to / them, lear is just an email bot that gives / them its opinion about a certain outage / or a problem.     #market-as / a supercomputer that / takes care of / deployment for you / for the dreamers / an ai copilot that / handles errors for you / for the enthusiasts  / a diagnosis agent / that saves a lot of / time in RCA and other / slog work, and saves / engineering hours for / the pessimistic.     ARYAN    Avi    Agrim
Morning - India / Afternoon - EMEA / Night - Americas    Investors
#Onboarding / Document/artifact  / - unique for each client, / be it a deck, website or a / pdf, whichever can get / most retention, and use / a brief overview of them / and the product to help / them understand how it / works, all regulations, / compliances and other / details.  / ## Agentic Workflow ->  / # general / artifact/website, or a / pptx or a pdf developed / by an agent for the / client that has all the / infromations regarding / onboarding friction. 
Initial Consultation with Client
Initial Approach
Understand where we can help / them, make them understand / lear's value prop for their / product. 
Discuss their infrastructure, / where it is hosted, their / engineering team, and other / details. 
With the CTO, to liason, / develop a connection, and / get a brief overview of the / cosebase.     Technical Consultation
Initial Meeting
HoE and CTO decide whether / another meeting with their / engineering team is nescesary 
Understand properly where the app can / help the client out, develop a product / spec 
Dev Meeting, all required human / capital discussed, modules / named, Agile Board created per / project, and work starts. 
Delta between first consultation and the plan discussion = max 3 days  / *subject to client's availability,  / *subject whether another client meeting nescesary before planning.     Whatsapp group production
If plan aprooved w/o major / changes, kickoff week starts, / otherwise rescheduling or / getting back to client with a / maximuim period of 12-32 / hours.  
CTO and HoE discuss implementation plan / with the engineering team, divide modules, / etc. 
#if client wants it, weekly / meetings regarding the status of / the proejct with the project / manager (HoE or Me), regarding / updates. 
Each module finished within / the same day, maximum client / turnover = 2 weeks, minimum / should be 1 week.  / subject to proper testing. 
Project Manager = CEO, COO / Project Lead = CTO, HoE / Q/A = Avi or Agrim  / Development = Aryan or Agrim
Ask them for a demo or a / mock of their service or / infra, or create our own / based on understanding, / hosted by us. #Lead or PM
Development  / max turnover per module = 1 days,  / max turnover per milestone = 1 week  / max time to first demo = 2 weeks.  / max time to ship after demo aprooval = 5 days.
Development Pipeline  / branch off the lear-backend  / everyone works on that branch, no more / branches,  / built using AWS,  / each module tested, each milestone tested / properly with a bug report and testing report / submitted by Q/A team on demand.  / max turnover for any Q/A report 12 hours
#passive  / taking continous passive feedback / around the product. / #active  / deal with lega, MoUs and contracts / with each client;a
email boys interface with the client as the / PM along with Dev Lead (if need be) to / help client understand the product, follow / up, send the build. t
Unique Page per partner, console allows them to manage / IAM users, and other dashboards,  / lear.drufiy.com/partner  / unique code per x devices per partner  / or pricing based device limit and other details for clients / before shipping and final deployment, edge cases created / (min 3500), bug reports made, and an executive summary / on the shipping MINIMUM 2 days before proposed ship / date.  / 
OTA Updates, Maintainance, uptime / monitoring, tracking client usage, API usage / and other details regarding each client. 
