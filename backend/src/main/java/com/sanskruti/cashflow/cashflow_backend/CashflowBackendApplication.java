package com.sanskruti.cashflow.cashflow_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.cache.annotation.EnableCaching;
@EnableCaching
@SpringBootApplication
public class CashflowBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(CashflowBackendApplication.class, args);
	}
	@Bean
	public ObjectMapper objectMapper() {
    	return new ObjectMapper();
}

}
