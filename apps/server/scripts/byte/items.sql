-- Items with stock on hand per store: opening balance (main store) + receipts - issues. tItemsDataSub is empty in Byte.
WITH moves AS (
  SELECT s.ItemName, COALESCE(NULLIF(s.Store_Name_Sub, ''), NULLIF(m.Store_Name, ''), NULLIF(m.StoreNameFrom, ''), N'الرئيسى') AS store,
    SUM(ISNULL(s.Q_Import, 0) - ISNULL(s.Q_Export, 0)) AS qty
  FROM tTranslateOrderSub s JOIN tTranslateOrderMain m ON m.TransID = s.TransID GROUP BY s.ItemName,
    COALESCE(NULLIF(s.Store_Name_Sub, ''), NULLIF(m.Store_Name, ''), NULLIF(m.StoreNameFrom, ''), N'الرئيسى')
)
SELECT i.ItemName AS name, i.ItemCode AS code, i.ItemCode2 AS code2, i.Car_Type AS car, i.Model AS model, i.Item_Group AS grp,
  i.Unit AS unit, i.Ubi_Price AS cost, i.Sale_Price AS price, i.Mini_Requird AS minQty, i.Location AS location,
  (SELECT store, ISNULL(qty, 0) + CASE WHEN store = N'الرئيسى' THEN ISNULL(i.[Start_Balance-Quantity], 0) ELSE 0 END AS qty
     FROM (SELECT store, qty FROM moves WHERE moves.ItemName = i.ItemName
           UNION SELECT N'الرئيسى', 0 WHERE NOT EXISTS (SELECT 1 FROM moves WHERE moves.ItemName = i.ItemName AND store = N'الرئيسى')) x
     FOR JSON PATH) AS stock
FROM tItemDataMain i ORDER BY i.ItemName;
