/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 365.0, "minX": 0.0, "maxY": 13179.0, "series": [{"data": [[0.0, 365.0], [0.1, 426.0], [0.2, 516.0], [0.3, 552.0], [0.4, 568.0], [0.5, 575.0], [0.6, 593.0], [0.7, 602.0], [0.8, 610.0], [0.9, 641.0], [1.0, 653.0], [1.1, 671.0], [1.2, 675.0], [1.3, 681.0], [1.4, 685.0], [1.5, 694.0], [1.6, 729.0], [1.7, 745.0], [1.8, 761.0], [1.9, 768.0], [2.0, 780.0], [2.1, 804.0], [2.2, 824.0], [2.3, 844.0], [2.4, 851.0], [2.5, 938.0], [2.6, 983.0], [2.7, 1322.0], [2.8, 1327.0], [2.9, 1392.0], [3.0, 1472.0], [3.1, 1484.0], [3.2, 1501.0], [3.3, 1508.0], [3.4, 1516.0], [3.5, 1579.0], [3.6, 1580.0], [3.7, 1651.0], [3.8, 1680.0], [3.9, 1717.0], [4.0, 1755.0], [4.1, 1784.0], [4.2, 1820.0], [4.3, 1838.0], [4.4, 1857.0], [4.5, 1861.0], [4.6, 1862.0], [4.7, 1909.0], [4.8, 1985.0], [4.9, 2010.0], [5.0, 2022.0], [5.1, 2040.0], [5.2, 2112.0], [5.3, 2159.0], [5.4, 2208.0], [5.5, 2251.0], [5.6, 2266.0], [5.7, 2325.0], [5.8, 2356.0], [5.9, 2359.0], [6.0, 2417.0], [6.1, 2487.0], [6.2, 2510.0], [6.3, 2515.0], [6.4, 2550.0], [6.5, 2640.0], [6.6, 2641.0], [6.7, 2692.0], [6.8, 2728.0], [6.9, 2757.0], [7.0, 2776.0], [7.1, 2793.0], [7.2, 2817.0], [7.3, 2841.0], [7.4, 2890.0], [7.5, 2902.0], [7.6, 2923.0], [7.7, 2940.0], [7.8, 2995.0], [7.9, 3007.0], [8.0, 3013.0], [8.1, 3042.0], [8.2, 3051.0], [8.3, 3056.0], [8.4, 3092.0], [8.5, 3106.0], [8.6, 3120.0], [8.7, 3129.0], [8.8, 3159.0], [8.9, 3184.0], [9.0, 3191.0], [9.1, 3209.0], [9.2, 3233.0], [9.3, 3253.0], [9.4, 3263.0], [9.5, 3272.0], [9.6, 3279.0], [9.7, 3288.0], [9.8, 3300.0], [9.9, 3314.0], [10.0, 3339.0], [10.1, 3351.0], [10.2, 3354.0], [10.3, 3375.0], [10.4, 3392.0], [10.5, 3422.0], [10.6, 3447.0], [10.7, 3454.0], [10.8, 3463.0], [10.9, 3479.0], [11.0, 3486.0], [11.1, 3498.0], [11.2, 3504.0], [11.3, 3514.0], [11.4, 3529.0], [11.5, 3538.0], [11.6, 3560.0], [11.7, 3584.0], [11.8, 3593.0], [11.9, 3598.0], [12.0, 3605.0], [12.1, 3612.0], [12.2, 3619.0], [12.3, 3634.0], [12.4, 3646.0], [12.5, 3708.0], [12.6, 3720.0], [12.7, 3746.0], [12.8, 3759.0], [12.9, 3773.0], [13.0, 3787.0], [13.1, 3815.0], [13.2, 3821.0], [13.3, 3826.0], [13.4, 3837.0], [13.5, 3851.0], [13.6, 3868.0], [13.7, 3875.0], [13.8, 3896.0], [13.9, 3909.0], [14.0, 3924.0], [14.1, 3962.0], [14.2, 3974.0], [14.3, 3983.0], [14.4, 3990.0], [14.5, 4002.0], [14.6, 4027.0], [14.7, 4041.0], [14.8, 4058.0], [14.9, 4070.0], [15.0, 4088.0], [15.1, 4112.0], [15.2, 4119.0], [15.3, 4129.0], [15.4, 4147.0], [15.5, 4155.0], [15.6, 4163.0], [15.7, 4172.0], [15.8, 4195.0], [15.9, 4198.0], [16.0, 4203.0], [16.1, 4213.0], [16.2, 4225.0], [16.3, 4260.0], [16.4, 4266.0], [16.5, 4272.0], [16.6, 4276.0], [16.7, 4292.0], [16.8, 4305.0], [16.9, 4315.0], [17.0, 4322.0], [17.1, 4330.0], [17.2, 4368.0], [17.3, 4378.0], [17.4, 4389.0], [17.5, 4410.0], [17.6, 4422.0], [17.7, 4444.0], [17.8, 4454.0], [17.9, 4466.0], [18.0, 4472.0], [18.1, 4491.0], [18.2, 4505.0], [18.3, 4518.0], [18.4, 4537.0], [18.5, 4537.0], [18.6, 4544.0], [18.7, 4557.0], [18.8, 4566.0], [18.9, 4573.0], [19.0, 4586.0], [19.1, 4588.0], [19.2, 4602.0], [19.3, 4608.0], [19.4, 4614.0], [19.5, 4625.0], [19.6, 4631.0], [19.7, 4638.0], [19.8, 4644.0], [19.9, 4654.0], [20.0, 4666.0], [20.1, 4673.0], [20.2, 4685.0], [20.3, 4697.0], [20.4, 4720.0], [20.5, 4727.0], [20.6, 4741.0], [20.7, 4749.0], [20.8, 4754.0], [20.9, 4758.0], [21.0, 4760.0], [21.1, 4765.0], [21.2, 4770.0], [21.3, 4775.0], [21.4, 4792.0], [21.5, 4800.0], [21.6, 4807.0], [21.7, 4808.0], [21.8, 4811.0], [21.9, 4815.0], [22.0, 4819.0], [22.1, 4832.0], [22.2, 4837.0], [22.3, 4841.0], [22.4, 4858.0], [22.5, 4858.0], [22.6, 4867.0], [22.7, 4878.0], [22.8, 4881.0], [22.9, 4905.0], [23.0, 4915.0], [23.1, 4917.0], [23.2, 4923.0], [23.3, 4934.0], [23.4, 4951.0], [23.5, 4953.0], [23.6, 4981.0], [23.7, 5004.0], [23.8, 5012.0], [23.9, 5019.0], [24.0, 5031.0], [24.1, 5037.0], [24.2, 5039.0], [24.3, 5040.0], [24.4, 5057.0], [24.5, 5077.0], [24.6, 5079.0], [24.7, 5091.0], [24.8, 5107.0], [24.9, 5107.0], [25.0, 5111.0], [25.1, 5120.0], [25.2, 5129.0], [25.3, 5140.0], [25.4, 5158.0], [25.5, 5163.0], [25.6, 5169.0], [25.7, 5175.0], [25.8, 5182.0], [25.9, 5190.0], [26.0, 5209.0], [26.1, 5212.0], [26.2, 5228.0], [26.3, 5238.0], [26.4, 5241.0], [26.5, 5245.0], [26.6, 5254.0], [26.7, 5260.0], [26.8, 5275.0], [26.9, 5284.0], [27.0, 5289.0], [27.1, 5298.0], [27.2, 5302.0], [27.3, 5306.0], [27.4, 5309.0], [27.5, 5313.0], [27.6, 5313.0], [27.7, 5316.0], [27.8, 5325.0], [27.9, 5334.0], [28.0, 5344.0], [28.1, 5348.0], [28.2, 5359.0], [28.3, 5366.0], [28.4, 5374.0], [28.5, 5379.0], [28.6, 5387.0], [28.7, 5396.0], [28.8, 5401.0], [28.9, 5409.0], [29.0, 5421.0], [29.1, 5429.0], [29.2, 5432.0], [29.3, 5439.0], [29.4, 5449.0], [29.5, 5457.0], [29.6, 5473.0], [29.7, 5485.0], [29.8, 5491.0], [29.9, 5509.0], [30.0, 5520.0], [30.1, 5545.0], [30.2, 5554.0], [30.3, 5564.0], [30.4, 5568.0], [30.5, 5575.0], [30.6, 5586.0], [30.7, 5598.0], [30.8, 5610.0], [30.9, 5613.0], [31.0, 5622.0], [31.1, 5627.0], [31.2, 5645.0], [31.3, 5652.0], [31.4, 5655.0], [31.5, 5664.0], [31.6, 5685.0], [31.7, 5693.0], [31.8, 5701.0], [31.9, 5705.0], [32.0, 5708.0], [32.1, 5710.0], [32.2, 5720.0], [32.3, 5721.0], [32.4, 5723.0], [32.5, 5746.0], [32.6, 5747.0], [32.7, 5767.0], [32.8, 5780.0], [32.9, 5783.0], [33.0, 5784.0], [33.1, 5785.0], [33.2, 5788.0], [33.3, 5797.0], [33.4, 5805.0], [33.5, 5810.0], [33.6, 5820.0], [33.7, 5828.0], [33.8, 5831.0], [33.9, 5839.0], [34.0, 5867.0], [34.1, 5869.0], [34.2, 5870.0], [34.3, 5884.0], [34.4, 5888.0], [34.5, 5893.0], [34.6, 5900.0], [34.7, 5935.0], [34.8, 5945.0], [34.9, 5952.0], [35.0, 5958.0], [35.1, 5968.0], [35.2, 5982.0], [35.3, 5990.0], [35.4, 5999.0], [35.5, 6001.0], [35.6, 6010.0], [35.7, 6016.0], [35.8, 6025.0], [35.9, 6030.0], [36.0, 6043.0], [36.1, 6048.0], [36.2, 6054.0], [36.3, 6062.0], [36.4, 6066.0], [36.5, 6074.0], [36.6, 6084.0], [36.7, 6098.0], [36.8, 6110.0], [36.9, 6118.0], [37.0, 6130.0], [37.1, 6150.0], [37.2, 6160.0], [37.3, 6176.0], [37.4, 6178.0], [37.5, 6180.0], [37.6, 6194.0], [37.7, 6200.0], [37.8, 6214.0], [37.9, 6223.0], [38.0, 6226.0], [38.1, 6228.0], [38.2, 6231.0], [38.3, 6239.0], [38.4, 6240.0], [38.5, 6286.0], [38.6, 6307.0], [38.7, 6319.0], [38.8, 6337.0], [38.9, 6345.0], [39.0, 6347.0], [39.1, 6352.0], [39.2, 6372.0], [39.3, 6383.0], [39.4, 6414.0], [39.5, 6433.0], [39.6, 6444.0], [39.7, 6449.0], [39.8, 6453.0], [39.9, 6464.0], [40.0, 6474.0], [40.1, 6489.0], [40.2, 6503.0], [40.3, 6512.0], [40.4, 6518.0], [40.5, 6521.0], [40.6, 6526.0], [40.7, 6558.0], [40.8, 6582.0], [40.9, 6588.0], [41.0, 6613.0], [41.1, 6627.0], [41.2, 6639.0], [41.3, 6646.0], [41.4, 6659.0], [41.5, 6661.0], [41.6, 6680.0], [41.7, 6684.0], [41.8, 6686.0], [41.9, 6691.0], [42.0, 6698.0], [42.1, 6706.0], [42.2, 6713.0], [42.3, 6717.0], [42.4, 6725.0], [42.5, 6736.0], [42.6, 6757.0], [42.7, 6768.0], [42.8, 6772.0], [42.9, 6783.0], [43.0, 6785.0], [43.1, 6793.0], [43.2, 6805.0], [43.3, 6810.0], [43.4, 6826.0], [43.5, 6829.0], [43.6, 6841.0], [43.7, 6850.0], [43.8, 6859.0], [43.9, 6871.0], [44.0, 6876.0], [44.1, 6894.0], [44.2, 6898.0], [44.3, 6914.0], [44.4, 6926.0], [44.5, 6940.0], [44.6, 6943.0], [44.7, 6950.0], [44.8, 6956.0], [44.9, 6959.0], [45.0, 6972.0], [45.1, 6980.0], [45.2, 7003.0], [45.3, 7010.0], [45.4, 7021.0], [45.5, 7042.0], [45.6, 7054.0], [45.7, 7068.0], [45.8, 7077.0], [45.9, 7093.0], [46.0, 7098.0], [46.1, 7115.0], [46.2, 7125.0], [46.3, 7125.0], [46.4, 7128.0], [46.5, 7135.0], [46.6, 7151.0], [46.7, 7170.0], [46.8, 7172.0], [46.9, 7178.0], [47.0, 7195.0], [47.1, 7200.0], [47.2, 7226.0], [47.3, 7242.0], [47.4, 7254.0], [47.5, 7258.0], [47.6, 7268.0], [47.7, 7270.0], [47.8, 7275.0], [47.9, 7291.0], [48.0, 7300.0], [48.1, 7310.0], [48.2, 7318.0], [48.3, 7342.0], [48.4, 7349.0], [48.5, 7354.0], [48.6, 7356.0], [48.7, 7373.0], [48.8, 7386.0], [48.9, 7432.0], [49.0, 7444.0], [49.1, 7454.0], [49.2, 7459.0], [49.3, 7476.0], [49.4, 7487.0], [49.5, 7499.0], [49.6, 7504.0], [49.7, 7512.0], [49.8, 7519.0], [49.9, 7525.0], [50.0, 7534.0], [50.1, 7537.0], [50.2, 7546.0], [50.3, 7553.0], [50.4, 7583.0], [50.5, 7600.0], [50.6, 7605.0], [50.7, 7614.0], [50.8, 7621.0], [50.9, 7629.0], [51.0, 7637.0], [51.1, 7647.0], [51.2, 7669.0], [51.3, 7676.0], [51.4, 7683.0], [51.5, 7689.0], [51.6, 7700.0], [51.7, 7701.0], [51.8, 7706.0], [51.9, 7718.0], [52.0, 7726.0], [52.1, 7733.0], [52.2, 7744.0], [52.3, 7752.0], [52.4, 7768.0], [52.5, 7776.0], [52.6, 7788.0], [52.7, 7791.0], [52.8, 7795.0], [52.9, 7805.0], [53.0, 7814.0], [53.1, 7835.0], [53.2, 7850.0], [53.3, 7855.0], [53.4, 7856.0], [53.5, 7865.0], [53.6, 7871.0], [53.7, 7876.0], [53.8, 7881.0], [53.9, 7889.0], [54.0, 7894.0], [54.1, 7908.0], [54.2, 7911.0], [54.3, 7917.0], [54.4, 7919.0], [54.5, 7924.0], [54.6, 7935.0], [54.7, 7947.0], [54.8, 7954.0], [54.9, 7955.0], [55.0, 7959.0], [55.1, 7976.0], [55.2, 7977.0], [55.3, 7981.0], [55.4, 7986.0], [55.5, 7999.0], [55.6, 8014.0], [55.7, 8020.0], [55.8, 8027.0], [55.9, 8032.0], [56.0, 8037.0], [56.1, 8054.0], [56.2, 8062.0], [56.3, 8065.0], [56.4, 8100.0], [56.5, 8118.0], [56.6, 8124.0], [56.7, 8151.0], [56.8, 8153.0], [56.9, 8158.0], [57.0, 8167.0], [57.1, 8182.0], [57.2, 8188.0], [57.3, 8194.0], [57.4, 8195.0], [57.5, 8197.0], [57.6, 8201.0], [57.7, 8207.0], [57.8, 8226.0], [57.9, 8228.0], [58.0, 8237.0], [58.1, 8239.0], [58.2, 8240.0], [58.3, 8243.0], [58.4, 8249.0], [58.5, 8256.0], [58.6, 8271.0], [58.7, 8287.0], [58.8, 8294.0], [58.9, 8307.0], [59.0, 8330.0], [59.1, 8340.0], [59.2, 8346.0], [59.3, 8362.0], [59.4, 8370.0], [59.5, 8380.0], [59.6, 8383.0], [59.7, 8391.0], [59.8, 8396.0], [59.9, 8400.0], [60.0, 8408.0], [60.1, 8414.0], [60.2, 8427.0], [60.3, 8439.0], [60.4, 8448.0], [60.5, 8466.0], [60.6, 8478.0], [60.7, 8482.0], [60.8, 8489.0], [60.9, 8507.0], [61.0, 8509.0], [61.1, 8519.0], [61.2, 8535.0], [61.3, 8554.0], [61.4, 8560.0], [61.5, 8566.0], [61.6, 8586.0], [61.7, 8599.0], [61.8, 8610.0], [61.9, 8615.0], [62.0, 8624.0], [62.1, 8625.0], [62.2, 8634.0], [62.3, 8647.0], [62.4, 8672.0], [62.5, 8678.0], [62.6, 8687.0], [62.7, 8725.0], [62.8, 8743.0], [62.9, 8749.0], [63.0, 8753.0], [63.1, 8765.0], [63.2, 8788.0], [63.3, 8797.0], [63.4, 8817.0], [63.5, 8821.0], [63.6, 8837.0], [63.7, 8839.0], [63.8, 8872.0], [63.9, 8882.0], [64.0, 8894.0], [64.1, 8907.0], [64.2, 8920.0], [64.3, 8927.0], [64.4, 8949.0], [64.5, 8956.0], [64.6, 8962.0], [64.7, 8978.0], [64.8, 8991.0], [64.9, 8997.0], [65.0, 9011.0], [65.1, 9016.0], [65.2, 9039.0], [65.3, 9057.0], [65.4, 9064.0], [65.5, 9085.0], [65.6, 9103.0], [65.7, 9125.0], [65.8, 9143.0], [65.9, 9159.0], [66.0, 9180.0], [66.1, 9187.0], [66.2, 9190.0], [66.3, 9204.0], [66.4, 9214.0], [66.5, 9233.0], [66.6, 9248.0], [66.7, 9251.0], [66.8, 9256.0], [66.9, 9275.0], [67.0, 9282.0], [67.1, 9285.0], [67.2, 9299.0], [67.3, 9310.0], [67.4, 9327.0], [67.5, 9339.0], [67.6, 9343.0], [67.7, 9359.0], [67.8, 9398.0], [67.9, 9433.0], [68.0, 9447.0], [68.1, 9459.0], [68.2, 9475.0], [68.3, 9485.0], [68.4, 9487.0], [68.5, 9492.0], [68.6, 9506.0], [68.7, 9511.0], [68.8, 9515.0], [68.9, 9524.0], [69.0, 9525.0], [69.1, 9541.0], [69.2, 9544.0], [69.3, 9557.0], [69.4, 9568.0], [69.5, 9571.0], [69.6, 9573.0], [69.7, 9590.0], [69.8, 9603.0], [69.9, 9610.0], [70.0, 9615.0], [70.1, 9624.0], [70.2, 9630.0], [70.3, 9633.0], [70.4, 9649.0], [70.5, 9653.0], [70.6, 9677.0], [70.7, 9686.0], [70.8, 9692.0], [70.9, 9707.0], [71.0, 9716.0], [71.1, 9719.0], [71.2, 9724.0], [71.3, 9727.0], [71.4, 9732.0], [71.5, 9746.0], [71.6, 9751.0], [71.7, 9759.0], [71.8, 9771.0], [71.9, 9776.0], [72.0, 9784.0], [72.1, 9797.0], [72.2, 9804.0], [72.3, 9808.0], [72.4, 9820.0], [72.5, 9829.0], [72.6, 9834.0], [72.7, 9866.0], [72.8, 9874.0], [72.9, 9880.0], [73.0, 9891.0], [73.1, 9896.0], [73.2, 9902.0], [73.3, 9909.0], [73.4, 9909.0], [73.5, 9921.0], [73.6, 9927.0], [73.7, 9932.0], [73.8, 9938.0], [73.9, 9949.0], [74.0, 9963.0], [74.1, 9970.0], [74.2, 9981.0], [74.3, 9988.0], [74.4, 9996.0], [74.5, 10000.0], [74.6, 10002.0], [74.7, 10005.0], [74.8, 10016.0], [74.9, 10025.0], [75.0, 10034.0], [75.1, 10044.0], [75.2, 10055.0], [75.3, 10062.0], [75.4, 10076.0], [75.5, 10091.0], [75.6, 10094.0], [75.7, 10102.0], [75.8, 10108.0], [75.9, 10111.0], [76.0, 10115.0], [76.1, 10117.0], [76.2, 10123.0], [76.3, 10124.0], [76.4, 10133.0], [76.5, 10136.0], [76.6, 10139.0], [76.7, 10149.0], [76.8, 10160.0], [76.9, 10163.0], [77.0, 10167.0], [77.1, 10175.0], [77.2, 10177.0], [77.3, 10181.0], [77.4, 10182.0], [77.5, 10188.0], [77.6, 10197.0], [77.7, 10198.0], [77.8, 10210.0], [77.9, 10213.0], [78.0, 10217.0], [78.1, 10225.0], [78.2, 10230.0], [78.3, 10243.0], [78.4, 10248.0], [78.5, 10249.0], [78.6, 10258.0], [78.7, 10270.0], [78.8, 10279.0], [78.9, 10285.0], [79.0, 10305.0], [79.1, 10309.0], [79.2, 10316.0], [79.3, 10318.0], [79.4, 10323.0], [79.5, 10331.0], [79.6, 10333.0], [79.7, 10347.0], [79.8, 10355.0], [79.9, 10364.0], [80.0, 10371.0], [80.1, 10375.0], [80.2, 10378.0], [80.3, 10380.0], [80.4, 10384.0], [80.5, 10388.0], [80.6, 10391.0], [80.7, 10404.0], [80.8, 10408.0], [80.9, 10409.0], [81.0, 10410.0], [81.1, 10419.0], [81.2, 10421.0], [81.3, 10439.0], [81.4, 10441.0], [81.5, 10453.0], [81.6, 10457.0], [81.7, 10466.0], [81.8, 10471.0], [81.9, 10472.0], [82.0, 10478.0], [82.1, 10483.0], [82.2, 10485.0], [82.3, 10485.0], [82.4, 10501.0], [82.5, 10504.0], [82.6, 10511.0], [82.7, 10512.0], [82.8, 10527.0], [82.9, 10535.0], [83.0, 10537.0], [83.1, 10541.0], [83.2, 10554.0], [83.3, 10559.0], [83.4, 10567.0], [83.5, 10572.0], [83.6, 10583.0], [83.7, 10592.0], [83.8, 10601.0], [83.9, 10604.0], [84.0, 10607.0], [84.1, 10628.0], [84.2, 10637.0], [84.3, 10643.0], [84.4, 10658.0], [84.5, 10668.0], [84.6, 10671.0], [84.7, 10686.0], [84.8, 10692.0], [84.9, 10696.0], [85.0, 10704.0], [85.1, 10708.0], [85.2, 10717.0], [85.3, 10723.0], [85.4, 10736.0], [85.5, 10744.0], [85.6, 10748.0], [85.7, 10759.0], [85.8, 10763.0], [85.9, 10774.0], [86.0, 10778.0], [86.1, 10783.0], [86.2, 10788.0], [86.3, 10788.0], [86.4, 10791.0], [86.5, 10799.0], [86.6, 10810.0], [86.7, 10813.0], [86.8, 10824.0], [86.9, 10830.0], [87.0, 10836.0], [87.1, 10840.0], [87.2, 10848.0], [87.3, 10852.0], [87.4, 10855.0], [87.5, 10863.0], [87.6, 10884.0], [87.7, 10896.0], [87.8, 10902.0], [87.9, 10923.0], [88.0, 10939.0], [88.1, 10942.0], [88.2, 10946.0], [88.3, 10948.0], [88.4, 10961.0], [88.5, 10970.0], [88.6, 10976.0], [88.7, 10985.0], [88.8, 10996.0], [88.9, 10999.0], [89.0, 11005.0], [89.1, 11013.0], [89.2, 11015.0], [89.3, 11021.0], [89.4, 11029.0], [89.5, 11038.0], [89.6, 11046.0], [89.7, 11053.0], [89.8, 11061.0], [89.9, 11066.0], [90.0, 11077.0], [90.1, 11084.0], [90.2, 11092.0], [90.3, 11098.0], [90.4, 11103.0], [90.5, 11111.0], [90.6, 11153.0], [90.7, 11156.0], [90.8, 11164.0], [90.9, 11170.0], [91.0, 11171.0], [91.1, 11172.0], [91.2, 11175.0], [91.3, 11184.0], [91.4, 11189.0], [91.5, 11201.0], [91.6, 11201.0], [91.7, 11218.0], [91.8, 11220.0], [91.9, 11230.0], [92.0, 11241.0], [92.1, 11249.0], [92.2, 11258.0], [92.3, 11262.0], [92.4, 11281.0], [92.5, 11281.0], [92.6, 11283.0], [92.7, 11288.0], [92.8, 11297.0], [92.9, 11312.0], [93.0, 11322.0], [93.1, 11330.0], [93.2, 11335.0], [93.3, 11342.0], [93.4, 11348.0], [93.5, 11359.0], [93.6, 11370.0], [93.7, 11385.0], [93.8, 11394.0], [93.9, 11399.0], [94.0, 11401.0], [94.1, 11403.0], [94.2, 11417.0], [94.3, 11424.0], [94.4, 11428.0], [94.5, 11441.0], [94.6, 11487.0], [94.7, 11507.0], [94.8, 11517.0], [94.9, 11521.0], [95.0, 11531.0], [95.1, 11545.0], [95.2, 11552.0], [95.3, 11561.0], [95.4, 11576.0], [95.5, 11591.0], [95.6, 11602.0], [95.7, 11607.0], [95.8, 11621.0], [95.9, 11638.0], [96.0, 11659.0], [96.1, 11682.0], [96.2, 11695.0], [96.3, 11724.0], [96.4, 11737.0], [96.5, 11744.0], [96.6, 11763.0], [96.7, 11777.0], [96.8, 11790.0], [96.9, 11807.0], [97.0, 11816.0], [97.1, 11846.0], [97.2, 11869.0], [97.3, 11888.0], [97.4, 11892.0], [97.5, 11912.0], [97.6, 11937.0], [97.7, 11953.0], [97.8, 12002.0], [97.9, 12005.0], [98.0, 12021.0], [98.1, 12045.0], [98.2, 12069.0], [98.3, 12085.0], [98.4, 12100.0], [98.5, 12116.0], [98.6, 12167.0], [98.7, 12182.0], [98.8, 12190.0], [98.9, 12230.0], [99.0, 12258.0], [99.1, 12287.0], [99.2, 12312.0], [99.3, 12344.0], [99.4, 12377.0], [99.5, 12442.0], [99.6, 12546.0], [99.7, 12626.0], [99.8, 12773.0], [99.9, 13157.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 41.0, "series": [{"data": [[300.0, 1.0], [400.0, 2.0], [500.0, 11.0], [600.0, 17.0], [700.0, 10.0], [800.0, 8.0], [900.0, 4.0], [1000.0, 1.0], [1300.0, 5.0], [1400.0, 5.0], [1500.0, 9.0], [1600.0, 4.0], [1700.0, 7.0], [1800.0, 10.0], [1900.0, 3.0], [2000.0, 7.0], [2100.0, 4.0], [2200.0, 5.0], [2300.0, 7.0], [2400.0, 4.0], [2500.0, 5.0], [2600.0, 6.0], [2700.0, 8.0], [2800.0, 7.0], [2900.0, 7.0], [3000.0, 13.0], [3100.0, 12.0], [3200.0, 13.0], [3300.0, 13.0], [3400.0, 14.0], [3500.0, 17.0], [3700.0, 11.0], [3600.0, 10.0], [3800.0, 17.0], [3900.0, 12.0], [4000.0, 11.0], [4100.0, 19.0], [4200.0, 16.0], [4300.0, 13.0], [4500.0, 20.0], [4400.0, 15.0], [4600.0, 23.0], [4700.0, 23.0], [4800.0, 27.0], [4900.0, 16.0], [5000.0, 23.0], [5100.0, 23.0], [5200.0, 24.0], [5300.0, 32.0], [5500.0, 17.0], [5600.0, 21.0], [5400.0, 23.0], [5800.0, 25.0], [5700.0, 31.0], [6000.0, 26.0], [6100.0, 19.0], [5900.0, 17.0], [6200.0, 18.0], [6300.0, 16.0], [6400.0, 16.0], [6500.0, 16.0], [6600.0, 22.0], [6700.0, 23.0], [6900.0, 19.0], [6800.0, 21.0], [7100.0, 21.0], [7000.0, 17.0], [7200.0, 18.0], [7400.0, 14.0], [7300.0, 17.0], [7600.0, 22.0], [7500.0, 19.0], [7700.0, 25.0], [7800.0, 25.0], [7900.0, 29.0], [8000.0, 17.0], [8100.0, 24.0], [8400.0, 19.0], [8600.0, 18.0], [8500.0, 18.0], [8200.0, 25.0], [8700.0, 14.0], [8300.0, 21.0], [8800.0, 15.0], [9100.0, 14.0], [9000.0, 13.0], [9200.0, 19.0], [8900.0, 17.0], [9400.0, 14.0], [9500.0, 25.0], [9600.0, 22.0], [9300.0, 12.0], [9700.0, 25.0], [9900.0, 27.0], [10100.0, 41.0], [10200.0, 24.0], [10000.0, 24.0], [9800.0, 20.0], [10700.0, 31.0], [10400.0, 33.0], [10500.0, 29.0], [10300.0, 35.0], [10600.0, 24.0], [11000.0, 28.0], [10900.0, 23.0], [11100.0, 23.0], [11200.0, 27.0], [10800.0, 25.0], [11300.0, 22.0], [11400.0, 15.0], [11500.0, 18.0], [11600.0, 13.0], [11700.0, 12.0], [11800.0, 12.0], [11900.0, 7.0], [12000.0, 12.0], [12100.0, 10.0], [12200.0, 6.0], [12300.0, 6.0], [12400.0, 1.0], [12500.0, 3.0], [12600.0, 2.0], [12700.0, 1.0], [12900.0, 1.0], [13100.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 13100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 3.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1936.0, "series": [{"data": [[1.0, 61.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 3.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1936.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 367.2704081632652, "minX": 1.5496185E12, "maxY": 725.0537694013298, "series": [{"data": [[1.54961856E12, 725.0537694013298], [1.5496185E12, 367.2704081632652]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 620.1111111111111, "minX": 1.0, "maxY": 13179.0, "series": [{"data": [[2.0, 10705.0], [4.0, 11281.0], [5.0, 11098.5], [7.0, 11549.0], [8.0, 11737.0], [10.0, 11048.5], [11.0, 10309.0], [12.0, 11591.0], [13.0, 10902.0], [14.0, 11768.0], [16.0, 11292.0], [17.0, 10941.0], [18.0, 11907.0], [19.0, 11507.0], [20.0, 10774.0], [21.0, 11155.0], [22.0, 11402.0], [23.0, 10540.0], [24.0, 10279.0], [25.0, 10453.0], [27.0, 11527.0], [28.0, 10780.0], [29.0, 10817.0], [31.0, 10578.5], [33.0, 10478.0], [32.0, 12173.0], [35.0, 11111.0], [34.0, 10788.0], [37.0, 11912.0], [36.0, 11172.0], [39.0, 10323.0], [38.0, 10567.0], [41.0, 12344.0], [40.0, 10345.0], [43.0, 10270.0], [42.0, 10231.0], [45.0, 11527.0], [44.0, 12005.0], [47.0, 10285.0], [46.0, 11046.0], [49.0, 11249.0], [48.0, 10920.0], [51.0, 11021.0], [50.0, 10985.0], [53.0, 11328.0], [55.0, 11777.0], [54.0, 11303.0], [57.0, 10483.0], [56.0, 10455.0], [59.0, 11335.0], [58.0, 10410.0], [61.0, 10273.0], [60.0, 11103.0], [63.0, 11312.0], [62.0, 11271.0], [66.0, 11613.0], [65.0, 12182.0], [64.0, 12100.0], [71.0, 12258.0], [70.0, 10763.0], [69.0, 10830.0], [68.0, 11483.0], [75.0, 10774.0], [74.0, 10376.0], [73.0, 11230.0], [72.0, 10160.0], [78.0, 5856.5], [79.0, 11807.0], [77.0, 10604.0], [76.0, 11015.0], [83.0, 11055.5], [81.0, 10931.0], [80.0, 10316.0], [87.0, 10842.0], [86.0, 11353.0], [85.0, 12045.0], [84.0, 10895.0], [91.0, 10409.0], [90.0, 10471.0], [89.0, 11170.0], [88.0, 12021.0], [93.0, 5801.0], [95.0, 10217.0], [94.0, 10111.0], [92.0, 11807.0], [99.0, 2266.285714285714], [98.0, 3445.25], [97.0, 11297.0], [96.0, 10559.0], [101.0, 620.1111111111111], [100.0, 1886.875], [103.0, 3987.3333333333335], [102.0, 7877.0], [105.0, 4374.0], [107.0, 4386.333333333334], [106.0, 6091.0], [104.0, 11401.0], [108.0, 6241.5], [109.0, 6517.5], [111.0, 10671.0], [110.0, 11038.0], [115.0, 11296.0], [114.0, 12072.0], [113.0, 10601.0], [112.0, 11073.0], [116.0, 5523.0], [119.0, 5452.0], [118.0, 11108.5], [123.0, 3054.3333333333335], [122.0, 877.5], [121.0, 11258.0], [120.0, 10102.0], [124.0, 4625.333333333334], [125.0, 2786.0], [127.0, 11763.0], [126.0, 11744.0], [135.0, 11283.0], [134.0, 10149.0], [133.0, 10837.0], [132.0, 11401.0], [131.0, 10439.0], [130.0, 10198.0], [129.0, 10567.0], [128.0, 11394.0], [143.0, 10470.0], [142.0, 11947.0], [141.0, 10305.0], [140.0, 10396.0], [139.0, 10660.5], [137.0, 10117.0], [136.0, 10005.0], [151.0, 10668.0], [150.0, 11359.0], [149.0, 10592.0], [148.0, 10355.0], [147.0, 11517.0], [146.0, 10504.0], [145.0, 11370.0], [144.0, 10333.0], [159.0, 11256.0], [158.0, 10607.0], [157.0, 10181.0], [156.0, 11281.0], [155.0, 11626.0], [154.0, 9946.0], [153.0, 10985.0], [152.0, 10123.0], [167.0, 10014.0], [166.0, 11330.0], [165.0, 10230.0], [164.0, 10899.0], [163.0, 10098.0], [162.0, 10284.0], [161.0, 12067.0], [160.0, 10762.0], [175.0, 10389.0], [174.0, 10812.0], [173.0, 11921.0], [172.0, 10138.0], [171.0, 10747.0], [170.0, 11464.0], [169.0, 11061.0], [168.0, 10189.0], [183.0, 11218.0], [182.0, 10813.0], [181.0, 10644.0], [180.0, 10248.0], [179.0, 10680.0], [178.0, 11545.0], [177.0, 10961.0], [176.0, 11221.0], [191.0, 11173.0], [190.0, 11153.0], [189.0, 9804.0], [188.0, 11288.0], [187.0, 10592.0], [186.0, 10378.0], [185.0, 11427.0], [184.0, 10849.0], [199.0, 11092.0], [198.0, 11424.0], [197.0, 11053.0], [196.0, 10601.0], [195.0, 10391.0], [194.0, 10512.0], [193.0, 10471.0], [192.0, 11288.0], [207.0, 10863.0], [206.0, 10225.0], [205.0, 10671.0], [204.0, 11937.0], [203.0, 10162.0], [202.0, 9763.0], [201.0, 10485.0], [200.0, 11189.0], [215.0, 10197.0], [214.0, 9866.0], [213.0, 10704.0], [212.0, 10197.0], [211.0, 9813.0], [210.0, 10485.0], [209.0, 10410.0], [208.0, 11362.0], [223.0, 10177.0], [222.0, 10210.0], [221.0, 10485.0], [219.0, 11545.0], [218.0, 10581.0], [217.0, 10520.0], [216.0, 10003.0], [224.0, 1508.0], [225.0, 7146.666666666667], [227.0, 4225.666666666666], [231.0, 9721.0], [230.0, 10637.0], [228.0, 11282.0], [226.0, 11170.0], [235.0, 6057.5], [238.0, 10328.0], [237.0, 10824.0], [236.0, 11177.0], [234.0, 10527.0], [233.0, 10385.0], [232.0, 9727.0], [241.0, 7769.666666666667], [242.0, 5704.5], [247.0, 10419.0], [246.0, 9719.0], [245.0, 10371.0], [244.0, 9751.0], [243.0, 10246.0], [240.0, 11218.0], [248.0, 4442.0], [249.0, 3802.75], [252.0, 5535.5], [255.0, 10537.0], [254.0, 10698.0], [253.0, 11056.0], [251.0, 10537.0], [250.0, 11441.0], [271.0, 13179.0], [261.0, 5612.0], [260.0, 10583.0], [262.0, 9800.0], [266.0, 4835.333333333334], [269.0, 4933.666666666666], [270.0, 9490.0], [268.0, 9610.0], [259.0, 10441.0], [258.0, 11391.0], [257.0, 10848.0], [256.0, 10208.0], [263.0, 10124.0], [267.0, 10146.0], [265.0, 10637.0], [264.0, 10512.0], [275.0, 5554.0], [277.0, 6276.5], [276.0, 11379.0], [278.0, 5665.5], [279.0, 4442.333333333334], [272.0, 12037.0], [274.0, 11035.0], [273.0, 9771.0], [286.0, 9909.0], [281.0, 9758.0], [280.0, 10778.0], [285.0, 11347.0], [284.0, 10318.0], [283.0, 9650.0], [282.0, 10511.0], [301.0, 6295.0], [288.0, 5993.25], [295.0, 10942.0], [293.0, 5722.0], [292.0, 10372.0], [294.0, 6079.5], [296.0, 6478.0], [298.0, 6319.0], [297.0, 10408.0], [299.0, 9995.0], [303.0, 10177.0], [302.0, 10709.0], [300.0, 11201.0], [291.0, 9590.0], [290.0, 10341.0], [319.0, 10000.0], [312.0, 4276.75], [318.0, 9233.0], [317.0, 10249.0], [316.0, 10025.0], [307.0, 11095.0], [306.0, 9429.0], [305.0, 10124.0], [304.0, 9715.0], [315.0, 10364.0], [314.0, 9615.0], [313.0, 11281.0], [311.0, 11018.0], [310.0, 9534.0], [308.0, 11206.0], [334.0, 9856.0], [320.0, 2047.0], [326.0, 6490.5], [325.0, 9829.0], [324.0, 10939.0], [328.0, 5879.5], [327.0, 6326.0], [329.0, 5369.333333333334], [331.0, 12006.0], [330.0, 10357.0], [335.0, 11342.0], [333.0, 13157.0], [332.0, 10388.0], [323.0, 10094.0], [322.0, 9653.0], [321.0, 11036.5], [350.0, 10220.0], [337.0, 4822.0], [336.0, 11417.0], [343.0, 10554.0], [342.0, 9997.0], [341.0, 9106.0], [340.0, 12108.0], [338.0, 5474.0], [351.0, 9487.0], [348.0, 11098.0], [339.0, 9016.0], [347.0, 12116.0], [346.0, 10694.0], [345.0, 12975.0], [344.0, 10186.0], [366.0, 11507.0], [358.0, 5576.0], [357.0, 10976.0], [356.0, 10076.0], [359.0, 11492.0], [353.0, 12626.0], [352.0, 10501.0], [355.0, 10131.0], [354.0, 10091.0], [364.0, 4198.75], [367.0, 9628.0], [365.0, 10948.0], [363.0, 10810.0], [362.0, 11005.0], [361.0, 8937.0], [360.0, 10213.0], [383.0, 6346.5], [376.0, 4517.0], [375.0, 7578.0], [373.0, 9963.0], [372.0, 10541.0], [382.0, 11552.0], [381.0, 9275.0], [380.0, 12366.0], [371.0, 10785.0], [370.0, 9064.0], [369.0, 10573.5], [379.0, 10788.0], [378.0, 10482.0], [377.0, 10855.0], [399.0, 11029.0], [387.0, 6340.5], [391.0, 10799.0], [384.0, 10723.0], [386.0, 12773.0], [385.0, 10380.0], [390.0, 12069.0], [389.0, 12542.0], [388.0, 11161.0], [393.0, 6417.5], [398.0, 11599.0], [397.0, 10630.0], [396.0, 9204.0], [395.0, 10535.0], [394.0, 10466.0], [392.0, 11861.0], [414.0, 12546.0], [404.0, 4562.333333333334], [405.0, 11816.0], [407.0, 12182.0], [400.0, 12655.0], [402.0, 9905.0], [401.0, 9732.0], [406.0, 8821.0], [403.0, 4016.5], [415.0, 10034.0], [413.0, 11805.0], [412.0, 11220.0], [411.0, 12546.0], [410.0, 9557.0], [409.0, 9910.0], [408.0, 10457.0], [429.0, 7289.0], [419.0, 5808.0], [423.0, 2510.0], [416.0, 10136.0], [418.0, 12442.0], [417.0, 10318.0], [422.0, 9746.0], [421.0, 10923.0], [420.0, 11869.0], [428.0, 6927.5], [431.0, 12393.0], [430.0, 10484.0], [427.0, 10167.0], [426.0, 9820.0], [425.0, 10485.0], [424.0, 11024.0], [446.0, 10744.0], [441.0, 5997.5], [438.0, 5230.666666666666], [437.0, 11761.0], [436.0, 9902.0], [439.0, 10948.0], [433.0, 9895.0], [432.0, 8786.0], [435.0, 12377.0], [434.0, 9310.0], [442.0, 7451.0], [443.0, 7242.0], [447.0, 9881.0], [445.0, 11156.0], [444.0, 11518.0], [440.0, 12295.0], [462.0, 2417.0], [460.0, 6975.5], [463.0, 10399.0], [461.0, 10943.0], [459.0, 9459.0], [458.0, 12099.0], [457.0, 11171.0], [456.0, 10952.0], [455.0, 11013.0], [449.0, 11531.0], [448.0, 10303.0], [451.0, 9727.0], [450.0, 9957.0], [454.0, 9830.0], [453.0, 10798.0], [452.0, 12196.0], [478.0, 6804.5], [469.0, 6659.0], [468.0, 10961.0], [471.0, 11385.0], [465.0, 9968.0], [464.0, 12085.0], [467.0, 10229.0], [466.0, 9901.0], [470.0, 9875.0], [472.0, 6592.5], [477.0, 7452.0], [479.0, 10305.0], [476.0, 9790.0], [475.0, 10384.0], [474.0, 10748.0], [473.0, 12005.0], [495.0, 10689.0], [480.0, 5800.666666666666], [486.0, 11681.0], [485.0, 10262.0], [484.0, 10347.0], [490.0, 6497.0], [494.0, 11892.0], [493.0, 11877.0], [492.0, 10163.0], [483.0, 10628.0], [482.0, 11544.0], [481.0, 9880.0], [491.0, 9934.0], [489.0, 9725.0], [488.0, 10414.0], [510.0, 10783.0], [498.0, 7106.0], [500.0, 7192.0], [501.0, 10736.0], [503.0, 10109.0], [497.0, 11002.0], [496.0, 11846.0], [502.0, 10115.0], [505.0, 6333.5], [506.0, 5282.333333333334], [509.0, 6438.5], [511.0, 10998.0], [504.0, 11621.0], [508.0, 9190.0], [499.0, 10594.0], [507.0, 9339.0], [540.0, 5879.5], [514.0, 7177.5], [517.0, 6677.5], [516.0, 11724.0], [515.0, 9603.0], [518.0, 10041.0], [536.0, 10999.0], [519.0, 11576.0], [539.0, 9508.0], [538.0, 9898.5], [521.0, 7202.5], [520.0, 10069.0], [522.0, 6218.0], [527.0, 11048.0], [513.0, 10332.0], [512.0, 11790.0], [526.0, 11084.0], [525.0, 11685.0], [524.0, 11682.0], [523.0, 11605.0], [528.0, 6799.0], [535.0, 5124.0], [534.0, 9333.0], [533.0, 11580.0], [532.0, 11607.0], [531.0, 10502.0], [530.0, 10789.0], [529.0, 11656.0], [541.0, 5643.0], [543.0, 10419.0], [542.0, 10158.0], [570.0, 10879.0], [574.0, 10381.0], [548.0, 6584.0], [547.0, 9807.0], [546.0, 11429.0], [545.0, 9484.0], [544.0, 9778.0], [559.0, 10026.0], [558.0, 10471.5], [556.0, 11423.0], [555.0, 8997.0], [554.0, 10450.0], [553.0, 10156.0], [549.0, 5717.0], [551.0, 5992.5], [550.0, 9139.0], [569.0, 10117.0], [568.0, 11241.0], [571.0, 10404.0], [560.0, 3213.0], [564.0, 7043.5], [563.0, 11171.0], [562.0, 10115.0], [561.0, 10330.0], [565.0, 9834.0], [567.0, 9909.0], [566.0, 11330.0], [575.0, 10638.0], [573.0, 10133.0], [572.0, 10165.0], [602.0, 6365.0], [576.0, 5954.5], [582.0, 6291.0], [581.0, 11201.0], [580.0, 10243.0], [579.0, 11238.0], [578.0, 10002.0], [577.0, 10463.0], [583.0, 11172.0], [601.0, 10316.0], [600.0, 9256.0], [603.0, 3107.0], [605.0, 8960.0], [604.0, 10757.0], [607.0, 10252.0], [592.0, 11038.0], [606.0, 9599.0], [584.0, 6274.0], [585.0, 10686.0], [586.0, 6898.5], [591.0, 6324.0], [590.0, 10320.0], [589.0, 9515.0], [588.0, 10759.0], [587.0, 10606.0], [593.0, 7233.0], [595.0, 4889.5], [594.0, 5213.0], [596.0, 6421.0], [597.0, 9633.0], [599.0, 9307.0], [598.0, 9699.0], [636.0, 6392.5], [615.0, 6597.5], [614.0, 9724.0], [613.0, 9511.0], [612.0, 9475.0], [611.0, 10426.0], [610.0, 9927.0], [609.0, 10408.0], [608.0, 10974.0], [623.0, 10106.0], [622.0, 10044.0], [621.0, 10249.0], [633.0, 8385.0], [632.0, 10181.0], [635.0, 9187.0], [634.0, 10139.0], [618.0, 6580.5], [617.0, 10136.0], [616.0, 10472.0], [620.0, 4526.8], [619.0, 5834.5], [630.0, 5955.5], [629.0, 8920.0], [628.0, 8647.0], [627.0, 8398.0], [626.0, 8482.0], [625.0, 10188.0], [624.0, 9011.0], [631.0, 9927.0], [639.0, 10018.0], [638.0, 10121.0], [637.0, 8554.0], [665.0, 9707.0], [643.0, 6229.5], [644.0, 6181.5], [646.0, 8610.0], [645.0, 9921.0], [664.0, 8370.0], [647.0, 10062.0], [666.0, 9784.0], [649.0, 6211.5], [648.0, 8687.0], [650.0, 5384.333333333334], [653.0, 5348.333333333334], [652.0, 9359.0], [651.0, 9949.0], [655.0, 9179.0], [640.0, 9260.0], [642.0, 10016.0], [641.0, 10718.0], [654.0, 9808.0], [668.0, 6380.0], [667.0, 6590.0], [669.0, 5617.0], [670.0, 8194.0], [657.0, 10055.0], [656.0, 8644.0], [659.0, 8673.0], [658.0, 8845.0], [661.0, 9630.0], [660.0, 9930.0], [663.0, 9282.0], [662.0, 9159.0], [696.0, 9568.0], [687.0, 5603.666666666667], [673.0, 5829.5], [672.0, 8526.5], [675.0, 8032.0], [674.0, 7935.0], [677.0, 8895.0], [676.0, 9759.0], [679.0, 9248.0], [678.0, 8678.0], [697.0, 9571.0], [680.0, 6645.0], [682.0, 9716.0], [681.0, 7853.0], [684.0, 9677.0], [683.0, 9447.0], [685.0, 5166.333333333333], [686.0, 5464.333333333333], [689.0, 4609.75], [688.0, 6786.0], [690.0, 3172.0], [695.0, 9379.0], [694.0, 8628.0], [693.0, 9573.0], [692.0, 9524.0], [691.0, 8291.0], [698.0, 5736.0], [700.0, 4751.25], [702.0, 6229.5], [701.0, 7871.0], [703.0, 4916.0], [699.0, 5812.5], [732.0, 6242.0], [707.0, 6287.0], [706.0, 5470.5], [705.0, 9248.0], [704.0, 8987.0], [719.0, 8194.0], [718.0, 8642.0], [710.0, 4796.666666666667], [709.0, 9190.0], [708.0, 9299.0], [728.0, 7908.0], [711.0, 8340.0], [729.0, 5362.0], [730.0, 6151.0], [731.0, 7971.0], [734.0, 4695.666666666667], [733.0, 9013.0], [735.0, 5151.0], [720.0, 8346.0], [713.0, 6108.0], [712.0, 8672.0], [716.0, 5317.5], [715.0, 6614.0], [714.0, 5453.0], [721.0, 6729.5], [722.0, 4719.5], [723.0, 6157.5], [726.0, 6015.75], [727.0, 6009.0], [725.0, 3839.6666666666665], [724.0, 7910.0], [740.0, 6129.5], [750.0, 4655.4], [738.0, 6124.0], [736.0, 4586.25], [737.0, 8586.0], [751.0, 9144.0], [739.0, 4548.0], [743.0, 5521.0], [742.0, 7503.0], [741.0, 7689.0], [760.0, 6073.666666666667], [761.0, 6037.0], [762.0, 5996.0], [763.0, 5628.0], [764.0, 9039.0], [765.0, 6026.5], [766.0, 5917.333333333333], [767.0, 4181.0], [753.0, 5075.75], [754.0, 4908.5], [758.0, 5031.5], [757.0, 7268.0], [756.0, 7459.0], [755.0, 7350.0], [759.0, 6844.5], [752.0, 6236.666666666666], [744.0, 5592.75], [745.0, 6096.0], [748.0, 5118.333333333333], [747.0, 5922.5], [746.0, 5903.0], [749.0, 4301.5], [793.0, 6942.0], [770.0, 4951.5], [768.0, 7514.333333333333], [769.0, 7195.0], [772.0, 4944.4], [771.0, 4330.125], [775.0, 4820.0], [774.0, 8978.0], [773.0, 7871.0], [792.0, 8167.0], [794.0, 8730.0], [796.0, 7793.0], [795.0, 8743.0], [798.0, 7768.0], [797.0, 8704.0], [776.0, 5309.25], [777.0, 8239.0], [779.0, 8186.0], [778.0, 7516.0], [780.0, 5124.75], [781.0, 4974.333333333333], [782.0, 8878.0], [783.0, 8608.0], [785.0, 6546.0], [784.0, 8376.0], [786.0, 8195.0], [789.0, 8333.5], [787.0, 7534.0], [791.0, 8100.0], [790.0, 8466.0], [799.0, 8193.0], [825.0, 8439.0], [830.0, 7637.0], [817.0, 6080.333333333333], [819.0, 9254.0], [818.0, 8195.0], [821.0, 8487.0], [820.0, 6793.0], [823.0, 7133.0], [822.0, 7945.0], [816.0, 5311.0], [815.0, 5524.666666666667], [801.0, 7258.0], [800.0, 7178.0], [804.0, 8504.0], [803.0, 8443.0], [806.0, 6958.0], [805.0, 8625.0], [824.0, 8950.0], [807.0, 8509.0], [827.0, 7626.5], [814.0, 5574.0], [813.0, 6125.666666666667], [811.0, 4586.416666666667], [810.0, 8151.0], [809.0, 7722.0], [808.0, 7342.0], [812.0, 8577.0], [831.0, 7540.0], [829.0, 6768.0], [828.0, 8043.0], [857.0, 7919.0], [862.0, 7376.0], [863.0, 7881.0], [849.0, 9285.0], [848.0, 10108.0], [851.0, 7890.0], [850.0, 6651.0], [853.0, 7670.0], [852.0, 7291.0], [861.0, 8231.0], [859.0, 8991.0], [858.0, 7345.0], [856.0, 9970.0], [839.0, 7629.0], [838.0, 7835.0], [837.0, 8751.0], [836.0, 8239.0], [835.0, 8202.0], [834.0, 7185.0], [833.0, 8168.0], [832.0, 7115.0], [847.0, 7432.0], [846.0, 8625.0], [845.0, 7069.0], [844.0, 8065.0], [843.0, 7098.0], [842.0, 7172.0], [841.0, 8163.0], [840.0, 8927.0], [855.0, 6874.0], [854.0, 6964.0], [892.0, 7608.0], [895.0, 6392.666666666667], [881.0, 7300.0], [880.0, 6836.0], [883.0, 7733.0], [882.0, 7717.0], [885.0, 8301.0], [884.0, 5780.0], [894.0, 5715.5], [893.0, 6850.0], [891.0, 8243.0], [890.0, 8152.0], [889.0, 8345.0], [888.0, 7683.0], [879.0, 7125.0], [864.0, 8566.0], [866.0, 7462.0], [865.0, 9125.0], [868.0, 7858.0], [867.0, 7742.0], [871.0, 9086.0], [870.0, 8478.0], [878.0, 7718.0], [877.0, 7172.0], [876.0, 5867.0], [875.0, 9687.0], [874.0, 7788.0], [873.0, 7499.0], [872.0, 9251.0], [887.0, 9318.0], [886.0, 8340.0], [912.0, 6572.0], [916.0, 6797.0], [920.0, 5767.333333333333], [921.0, 5366.2], [922.0, 6120.0], [923.0, 7354.0], [925.0, 4772.636363636364], [926.0, 5105.125], [927.0, 5200.333333333333], [924.0, 6532.0], [903.0, 6516.333333333333], [902.0, 5615.5], [901.0, 5424.666666666667], [900.0, 5892.666666666667], [899.0, 4908.8], [898.0, 6813.0], [897.0, 5420.428571428572], [896.0, 6086.0], [911.0, 5573.166666666667], [909.0, 5962.666666666667], [910.0, 5900.0], [908.0, 5631.0], [907.0, 6243.666666666667], [906.0, 5627.666666666667], [905.0, 6393.0], [904.0, 5106.0], [919.0, 6567.333333333333], [918.0, 6194.0], [917.0, 6573.0], [915.0, 6091.0], [914.0, 5692.0], [913.0, 7110.0], [935.0, 5282.5], [929.0, 5121.166666666667], [928.0, 4826.200000000001], [943.0, 5241.0], [931.0, 6134.333333333333], [930.0, 6784.0], [932.0, 8907.0], [934.0, 8615.0], [933.0, 7986.0], [936.0, 6198.666666666667], [937.0, 8062.0], [939.0, 9045.0], [938.0, 8427.0], [941.0, 8014.0], [940.0, 8753.0], [942.0, 6471.5], [945.0, 5214.0], [948.0, 5897.0], [947.0, 7825.0], [946.0, 8429.0], [949.0, 6684.0], [951.0, 6692.0], [950.0, 7957.0], [952.0, 5240.0], [953.0, 6328.25], [954.0, 7354.0], [956.0, 6372.0], [955.0, 7605.0], [958.0, 6273.0], [959.0, 6383.0], [944.0, 5212.0], [957.0, 6042.25], [966.0, 6527.0], [971.0, 5312.0], [961.0, 6155.6], [963.0, 8894.0], [962.0, 7865.0], [975.0, 7873.0], [960.0, 6150.0], [965.0, 5825.5], [964.0, 6851.5], [979.0, 6308.0], [981.0, 6845.0], [980.0, 6810.0], [983.0, 7537.0], [982.0, 7600.0], [978.0, 6452.666666666667], [977.0, 7009.0], [976.0, 7519.0], [991.0, 7924.0], [990.0, 7791.0], [989.0, 7889.0], [987.0, 5370.857142857143], [986.0, 5493.333333333334], [988.0, 5372.714285714286], [984.0, 6612.0], [967.0, 8393.0], [985.0, 5876.5], [969.0, 6551.0], [968.0, 6998.5], [970.0, 6263.5], [972.0, 5375.666666666667], [973.0, 7386.0], [974.0, 7603.5], [998.0, 6254.75], [993.0, 5532.5], [992.0, 5877.666666666667], [1006.0, 6957.0], [1005.0, 8380.0], [1004.0, 7274.0], [1007.0, 6841.5], [994.0, 5968.4], [995.0, 6776.333333333333], [999.0, 6337.25], [1017.0, 6498.5], [1018.0, 6184.4], [1020.0, 6300.0], [1021.0, 7850.0], [1023.0, 7275.0], [1022.0, 7504.0], [1019.0, 5801.571428571428], [1016.0, 6411.333333333333], [1008.0, 6531.25], [1009.0, 6107.75], [1010.0, 6121.6], [1011.0, 5829.0], [1013.0, 6267.5], [1015.0, 5745.0], [1014.0, 5703.75], [1012.0, 7074.5], [997.0, 6382.666666666667], [996.0, 6692.0], [1000.0, 6121.0], [1002.0, 5983.5], [1001.0, 7268.0], [1003.0, 5777.333333333333], [1032.0, 6377.5], [1028.0, 6576.5], [1026.0, 6004.0], [1024.0, 8401.0], [1054.0, 5765.0], [1052.0, 7999.0], [1050.0, 7599.0], [1048.0, 6865.0], [1042.0, 8237.0], [1040.0, 8249.0], [1044.0, 5810.6], [1046.0, 6546.6], [1030.0, 6167.2], [1034.0, 6742.0], [1036.0, 8307.0], [1038.0, 8019.0], [1072.0, 5503.5], [1074.0, 7310.0], [1076.0, 6928.0], [1078.0, 6914.0], [1080.0, 7919.0], [1082.0, 6788.5], [1084.0, 7959.0], [1056.0, 8118.0], [1086.0, 7917.0], [1060.0, 6893.0], [1062.0, 6609.666666666667], [1064.0, 7275.5], [1070.0, 7977.0], [1068.0, 7920.0], [1066.0, 5314.0], [1094.0, 6977.333333333333], [1088.0, 6783.0], [1090.0, 5869.0], [1114.0, 7005.0], [1116.0, 7487.0], [1118.0, 7947.0], [1108.0, 7896.0], [1110.0, 8680.0], [1106.0, 6760.333333333333], [1104.0, 6738.0], [1092.0, 6246.0], [1096.0, 6156.0], [1098.0, 6970.5], [1102.0, 5542.285714285715], [1138.0, 6518.0], [1140.0, 6349.0], [1142.0, 7808.0], [1144.0, 6259.0], [1148.0, 6060.75], [1146.0, 7010.0], [1150.0, 5868.833333333333], [1120.0, 6950.0], [1136.0, 6502.5], [1122.0, 7546.0], [1124.0, 6946.0], [1126.0, 6725.0], [1134.0, 7135.0], [1132.0, 6659.0], [1130.0, 6769.0], [1128.0, 7621.0], [1100.0, 7447.0], [1160.0, 6558.0], [1154.0, 6214.0], [1152.0, 7525.0], [1182.0, 6622.5], [1178.0, 6214.0], [1176.0, 5520.0], [1180.0, 5807.0], [1172.0, 5461.333333333333], [1174.0, 5772.0], [1158.0, 6091.666666666667], [1156.0, 5401.0], [1162.0, 6213.0], [1184.0, 6408.333333333333], [1214.0, 5900.0], [1212.0, 6532.0], [1208.0, 5760.0], [1206.0, 7003.0], [1210.0, 6337.5], [1202.0, 6042.0], [1200.0, 5785.0], [1204.0, 6613.0], [1186.0, 6189.333333333333], [1188.0, 7459.0], [1192.0, 6444.0], [1194.0, 5627.5], [1198.0, 5820.0], [1196.0, 6213.333333333333], [1190.0, 6168.333333333333], [1166.0, 6408.75], [1164.0, 6344.0], [1170.0, 6891.0], [1168.0, 7258.0], [1220.0, 6691.0], [1216.0, 5614.333333333333], [1222.0, 5887.0], [1224.0, 7477.0], [1218.0, 6583.0], [1029.0, 6341.5], [1027.0, 5930.5], [1025.0, 6083.8], [1055.0, 7310.0], [1053.0, 5417.0], [1051.0, 6973.0], [1049.0, 6972.0], [1047.0, 5631.666666666667], [1043.0, 6340.666666666667], [1041.0, 6319.0], [1045.0, 5769.2], [1031.0, 6412.5], [1033.0, 6665.5], [1037.0, 6934.333333333333], [1035.0, 7242.0], [1039.0, 7111.0], [1073.0, 6740.333333333333], [1075.0, 5986.0], [1077.0, 6472.0], [1079.0, 6893.0], [1081.0, 6071.4], [1083.0, 7706.0], [1085.0, 6026.5], [1087.0, 7016.0], [1057.0, 6037.0], [1059.0, 7812.5], [1065.0, 6118.25], [1071.0, 7068.0], [1069.0, 8156.0], [1067.0, 8618.0], [1063.0, 6359.5], [1061.0, 6006.75], [1095.0, 6805.0], [1099.0, 5982.0], [1089.0, 7981.0], [1091.0, 7744.0], [1115.0, 6003.0], [1113.0, 8077.0], [1117.0, 7699.0], [1119.0, 7021.0], [1109.0, 6700.0], [1111.0, 7620.0], [1107.0, 5925.5], [1093.0, 6491.666666666667], [1097.0, 6007.0], [1103.0, 6838.5], [1137.0, 5717.666666666667], [1139.0, 7226.0], [1143.0, 6771.5], [1141.0, 6980.0], [1147.0, 6286.0], [1145.0, 6525.0], [1149.0, 6049.5], [1151.0, 5877.555555555556], [1121.0, 6632.0], [1123.0, 7280.0], [1125.0, 6661.0], [1127.0, 6187.5], [1135.0, 6841.0], [1133.0, 6197.0], [1131.0, 6718.0], [1129.0, 6646.0], [1101.0, 5966.0], [1161.0, 5567.0], [1167.0, 6207.0], [1153.0, 6167.5], [1183.0, 5868.0], [1179.0, 6106.5], [1177.0, 6074.0], [1181.0, 5851.0], [1173.0, 6072.0], [1175.0, 6371.0], [1157.0, 5897.0], [1155.0, 6894.0], [1159.0, 6783.0], [1213.0, 6340.5], [1215.0, 6184.75], [1211.0, 5974.5], [1207.0, 6774.0], [1209.0, 7151.0], [1201.0, 5232.0], [1203.0, 7270.0], [1205.0, 5947.666666666667], [1185.0, 5910.666666666667], [1187.0, 6154.0], [1191.0, 6399.6], [1193.0, 5935.0], [1195.0, 5758.285714285715], [1197.0, 6465.0], [1199.0, 6952.0], [1189.0, 6299.5], [1165.0, 6582.0], [1163.0, 6322.0], [1171.0, 6810.333333333333], [1169.0, 6575.5], [1217.0, 5918.666666666666], [1221.0, 5636.0], [1223.0, 7162.333333333333], [1219.0, 6616.0], [1.0, 11077.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[689.9910000000006, 7344.418999999991]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1224.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 1231.5333333333333, "minX": 1.5496185E12, "maxY": 12626.533333333333, "series": [{"data": [[1.54961856E12, 12626.533333333333], [1.5496185E12, 1371.8]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961856E12, 11335.133333333333], [1.5496185E12, 1231.5333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 2016.1173469387757, "minX": 1.5496185E12, "maxY": 7923.325388026601, "series": [{"data": [[1.54961856E12, 7923.325388026601], [1.5496185E12, 2016.1173469387757]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 2016.0918367346944, "minX": 1.5496185E12, "maxY": 7923.317073170721, "series": [{"data": [[1.54961856E12, 7923.317073170721], [1.5496185E12, 2016.0918367346944]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 9.112244897959187, "minX": 1.5496185E12, "maxY": 80.76718403547666, "series": [{"data": [[1.54961856E12, 80.76718403547666], [1.5496185E12, 9.112244897959187]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 365.0, "minX": 1.5496185E12, "maxY": 13179.0, "series": [{"data": [[1.54961856E12, 13179.0], [1.5496185E12, 3967.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961856E12, 2692.0], [1.5496185E12, 365.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961856E12, 11076.6], [1.5496185E12, 3393.7000000000003]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961856E12, 12257.880000000001], [1.5496185E12, 3962.15]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961856E12, 11530.8], [1.5496185E12, 3587.7999999999997]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 2006.5, "minX": 3.0, "maxY": 7955.0, "series": [{"data": [[3.0, 2006.5], [30.0, 7955.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 2006.5, "minX": 3.0, "maxY": 7955.0, "series": [{"data": [[3.0, 2006.5], [30.0, 7955.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 14.9, "minX": 1.5496185E12, "maxY": 18.433333333333334, "series": [{"data": [[1.54961856E12, 18.433333333333334], [1.5496185E12, 14.9]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 3.2666666666666666, "minX": 1.5496185E12, "maxY": 30.066666666666666, "series": [{"data": [[1.54961856E12, 30.066666666666666], [1.5496185E12, 3.2666666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 3.2666666666666666, "minX": 1.5496185E12, "maxY": 30.066666666666666, "series": [{"data": [[1.54961856E12, 30.066666666666666], [1.5496185E12, 3.2666666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
