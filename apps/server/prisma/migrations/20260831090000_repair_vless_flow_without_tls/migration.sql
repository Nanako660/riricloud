-- VLESS Vision flow requires TLS/Reality. Remove it from legacy plaintext rows.
UPDATE "NodeInbound"
SET "paramsJson" = json_remove("paramsJson", '$.flow')
WHERE "type" IN ('VLESS', 'VLESS_REALITY')
  AND json_valid("paramsJson")
  AND json_extract("paramsJson", '$.flow') IS NOT NULL
  AND (
    json_extract("paramsJson", '$.tls.enabled') = 0
    OR json_extract("paramsJson", '$.tls.mode') = 'none'
  );
