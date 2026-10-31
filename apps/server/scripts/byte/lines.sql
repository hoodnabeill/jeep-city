-- All work order lines in one list: labor, parts, materials and outside work.
SELECT 'labor' AS cat, Sub_id AS id, Work_Order_No AS no, Item_No AS code, Item_Name AS name, Item_Quantity AS qty, Item_Price AS price,
  Item_Techecal AS tech, CONVERT(varchar(10), Item_End_Date, 126) AS doneAt FROM tWork_Orders_Sub
UNION ALL
SELECT 'part', spare_id, Work_Order_No, Item_No, Item_Name, Item_Quantity, Item_Price, Tehnial_Name, CONVERT(varchar(10), Move_Date, 126) FROM tWork_Orders_Sub_SparPart
UNION ALL
SELECT 'material', Spent_id, Work_Order_No, Item_No, Item_Name, Item_Quantity, Item_Price, NULL, NULL FROM tWork_Orders_Sub_Khmat_Spent
ORDER BY no, cat, id;
