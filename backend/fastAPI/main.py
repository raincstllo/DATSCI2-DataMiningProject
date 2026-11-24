from fastapi import FastAPI
from pydantic import BaseModel
from pyspark.sql import SparkSession


"""

Baseline ones too:
uv
and python...

Install the dependencies please, fastAPI (Through the fuckass terminal please)
pydantic (THrough terminal too)
pyspark (through terminal too) //This specifically: pip install "fastapi[standard]" pyspark

"""

"""
MY understanding:
FastAPI is another backend that is active when deployed. The two communicates with each other, Angular would
feed the data (fetch mongoDB data) prep csv that is fed to the thingy of fastAPI.

website url calls for fastAPI is akin to calling functions. Its called, loaded and then returns a value.

If Angular were to communicate, it'll use the return value of the fastAPI web function call.

Store that data somewhere then render that mofo.
"""

app = FastAPI()


class Item(BaseModel):#THIS FUCKASS CREATES SCHEMA LIKE MONGOOSE
    name: str
    price: float
    is_offer: bool | None = None

class records(BaseModel): #order_id,customer_name,category,region,amount,quantity,order_date,status
    order_id:str
    customer_name:str
    category:str
    region:str
    amount:int
    quantity:int
    order_date:str
    status:str


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}


@app.put("/items/{item_id}")
def update_item(item_id: int, item: Item):
    return {"item_name": item.name, "item_id": item_id}


@app.get("/waga")
def read_waga():
    returnvalue = ""
    spark = SparkSession.builder\
        .appName("Testing")\
        .master("local[*]")\
        .getOrCreate()

    df = spark.read.csv("data.csv",inferSchema=True,header=True)

    df.printSchema()

    returnvalue = df.select("order_id","customer_name").distinct().collect() #[NOTE] .collect() is important!!!

    regionCount = df.groupBy("region").count().collect()



    spark.stop()
    return {"Testing":regionCount } #This returns the values that are stored in returnvalue: In this scenario, all the record's order_id and customer_name

    spark.stop()






    return{"Can you see mee?":"PLease..."}

@app.get("/fuckoff")
def readSomething():
    return{"I AM WORKING"}