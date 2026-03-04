package com.sanskruti.cashflow.cashflow_backend.api;

import com.sanskruti.cashflow.cashflow_backend.api.dto.AiAnswerResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiQuestionRequest;
import com.sanskruti.cashflow.cashflow_backend.service.AiFacadeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/datasets")
public class AiController {

    private final AiFacadeService aiFacadeService;

    public AiController(AiFacadeService aiFacadeService) {
        this.aiFacadeService = aiFacadeService;
    }

    @PostMapping("/{id}/explain")
    public AiInsightsResponse explain(@PathVariable Long id,
                                      @RequestParam(defaultValue = "12") int horizon) throws Exception {
        return aiFacadeService.explainCached(id, horizon);
    }

    @PostMapping({"/{id}/ask", "/{id}/chat"})
    public AiAnswerResponse ask(@PathVariable Long id,
                                @RequestParam(defaultValue = "12") int horizon,
                                @Valid @RequestBody AiQuestionRequest request) throws Exception {
        return aiFacadeService.askFromInsights(id, horizon, request.question());
    }
}
