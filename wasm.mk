LFLAGS += -sENVIRONMENT=node --pre-js "$(ENTRY_JS)" \
    --embed-file "$(INVENTORY_PI)@/inventory.pi"
