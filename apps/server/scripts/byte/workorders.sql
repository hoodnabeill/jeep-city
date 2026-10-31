-- Work order headers. The date and the time of entry are separate columns in Byte.
SELECT Work_Order_No AS no, CONVERT(varchar(10), Work_Order_Date, 126) AS d, CONVERT(varchar(8), Work_Order_In_Time, 108) AS t,
  CONVERT(varchar(19), Work_Finsh_Out_Time, 126) AS outAt, Work_Order_Statuse AS status, Work_Care_No AS plate,
  Cust_Car_Shase_No AS chassis, Cust_Car_model AS model, Cust_Car_Kind AS kind, Work_Care_Counter AS km,
  Cust_Name AS name, Co_Name AS company, Cust_Tel_Mobile AS mobile, Cust_Tel_Home AS home, Cust_Tel_Work AS work, Cust_Address AS address,
  Work_Care_Truble AS complaint, Repair_Description AS repair, Notes AS notes, Work_Care_Recive_Name AS receiver, Tamin_Co AS insurer,
  Total_Net AS totalNet, Total_Baky AS due, Total_Realy_Visa AS visa,
  (SELECT SUM(a.Daean) FROM tAccount_Data a WHERE a.Work_Order_No = w.Work_Order_No) AS paid
FROM tWork_Orders_Main w ORDER BY Work_Order_No;
