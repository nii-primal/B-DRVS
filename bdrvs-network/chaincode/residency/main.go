package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	contract := new(ResidencyContract)
	contract.Name = "residency"
	contract.Info.Title = "B-DRVS Residency Contract"
	contract.Info.Description = "Blockchain-Based Data Residency Verification for Ghana Health Data Sovereignty"
	contract.Info.Version = "1.0.0"

	chaincode, err := contractapi.NewChaincode(contract)
	if err != nil {
		fmt.Printf("[B-DRVS] Error creating residency chaincode: %s\n", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("[B-DRVS] Error starting residency chaincode: %s\n", err)
	}
}
