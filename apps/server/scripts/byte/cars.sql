-- One row per car with its owner (tCars_Data). Car_Type holds the governorate, Car_Kind the model (DECISIONS: back-end).
SELECT Car_Code AS code, Car_No AS plate, Car_Shaceh_No AS chassis, Car_Motor_No AS engineNo, Car_Kind AS kind, Model AS year,
  Car_Color AS color, Cust_Name AS name, Co_Name AS company, Cust_Tel_Mobile AS mobile, Cust_Tel_Home AS home, Cust_Tel_Work AS work,
  Cust_Address AS address, Car_Type AS governorate, Email AS email, Notes AS notes, CONVERT(varchar(19), Store_Date, 126) AS storedAt
FROM tCars_Data ORDER BY Car_Code;
