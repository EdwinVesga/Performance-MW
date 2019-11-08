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
        data: {"result": {"minY": 871.0, "minX": 0.0, "maxY": 26246.0, "series": [{"data": [[0.0, 871.0], [0.1, 1057.0], [0.2, 1084.0], [0.3, 1090.0], [0.4, 1093.0], [0.5, 1099.0], [0.6, 1112.0], [0.7, 1154.0], [0.8, 1208.0], [0.9, 1275.0], [1.0, 1320.0], [1.1, 1414.0], [1.2, 1474.0], [1.3, 1595.0], [1.4, 1664.0], [1.5, 1684.0], [1.6, 1722.0], [1.7, 1792.0], [1.8, 1818.0], [1.9, 1835.0], [2.0, 1849.0], [2.1, 1919.0], [2.2, 1987.0], [2.3, 2008.0], [2.4, 2092.0], [2.5, 2299.0], [2.6, 2396.0], [2.7, 2457.0], [2.8, 2531.0], [2.9, 2607.0], [3.0, 2650.0], [3.1, 3248.0], [3.2, 3343.0], [3.3, 3380.0], [3.4, 3426.0], [3.5, 3492.0], [3.6, 3540.0], [3.7, 3553.0], [3.8, 3596.0], [3.9, 3621.0], [4.0, 3639.0], [4.1, 3685.0], [4.2, 3727.0], [4.3, 3782.0], [4.4, 3809.0], [4.5, 3863.0], [4.6, 3898.0], [4.7, 3968.0], [4.8, 4041.0], [4.9, 4079.0], [5.0, 4117.0], [5.1, 4152.0], [5.2, 4157.0], [5.3, 4166.0], [5.4, 4183.0], [5.5, 4193.0], [5.6, 4206.0], [5.7, 4215.0], [5.8, 4234.0], [5.9, 4242.0], [6.0, 4260.0], [6.1, 4265.0], [6.2, 4273.0], [6.3, 4275.0], [6.4, 4289.0], [6.5, 4309.0], [6.6, 4316.0], [6.7, 4330.0], [6.8, 4359.0], [6.9, 4383.0], [7.0, 4395.0], [7.1, 4402.0], [7.2, 4416.0], [7.3, 4431.0], [7.4, 4463.0], [7.5, 4504.0], [7.6, 4517.0], [7.7, 4536.0], [7.8, 4548.0], [7.9, 4572.0], [8.0, 4585.0], [8.1, 4611.0], [8.2, 4645.0], [8.3, 4649.0], [8.4, 4672.0], [8.5, 4677.0], [8.6, 4688.0], [8.7, 4709.0], [8.8, 4742.0], [8.9, 4770.0], [9.0, 4796.0], [9.1, 4800.0], [9.2, 4827.0], [9.3, 4838.0], [9.4, 4854.0], [9.5, 4880.0], [9.6, 4898.0], [9.7, 4914.0], [9.8, 4937.0], [9.9, 4948.0], [10.0, 4952.0], [10.1, 4978.0], [10.2, 4988.0], [10.3, 5005.0], [10.4, 5010.0], [10.5, 5023.0], [10.6, 5038.0], [10.7, 5050.0], [10.8, 5056.0], [10.9, 5103.0], [11.0, 5116.0], [11.1, 5128.0], [11.2, 5133.0], [11.3, 5139.0], [11.4, 5152.0], [11.5, 5194.0], [11.6, 5211.0], [11.7, 5218.0], [11.8, 5239.0], [11.9, 5257.0], [12.0, 5278.0], [12.1, 5283.0], [12.2, 5292.0], [12.3, 5306.0], [12.4, 5321.0], [12.5, 5322.0], [12.6, 5329.0], [12.7, 5342.0], [12.8, 5365.0], [12.9, 5368.0], [13.0, 5398.0], [13.1, 5417.0], [13.2, 5436.0], [13.3, 5442.0], [13.4, 5462.0], [13.5, 5485.0], [13.6, 5501.0], [13.7, 5525.0], [13.8, 5537.0], [13.9, 5549.0], [14.0, 5555.0], [14.1, 5572.0], [14.2, 5602.0], [14.3, 5634.0], [14.4, 5667.0], [14.5, 5685.0], [14.6, 5690.0], [14.7, 5703.0], [14.8, 5705.0], [14.9, 5760.0], [15.0, 5787.0], [15.1, 5817.0], [15.2, 5827.0], [15.3, 5835.0], [15.4, 5867.0], [15.5, 5875.0], [15.6, 5887.0], [15.7, 5899.0], [15.8, 5934.0], [15.9, 5951.0], [16.0, 5962.0], [16.1, 6000.0], [16.2, 6012.0], [16.3, 6024.0], [16.4, 6029.0], [16.5, 6065.0], [16.6, 6075.0], [16.7, 6104.0], [16.8, 6111.0], [16.9, 6145.0], [17.0, 6150.0], [17.1, 6171.0], [17.2, 6179.0], [17.3, 6201.0], [17.4, 6232.0], [17.5, 6261.0], [17.6, 6278.0], [17.7, 6321.0], [17.8, 6347.0], [17.9, 6366.0], [18.0, 6381.0], [18.1, 6397.0], [18.2, 6427.0], [18.3, 6441.0], [18.4, 6494.0], [18.5, 6504.0], [18.6, 6511.0], [18.7, 6529.0], [18.8, 6550.0], [18.9, 6575.0], [19.0, 6583.0], [19.1, 6592.0], [19.2, 6608.0], [19.3, 6629.0], [19.4, 6639.0], [19.5, 6718.0], [19.6, 6758.0], [19.7, 6796.0], [19.8, 6837.0], [19.9, 6892.0], [20.0, 6946.0], [20.1, 6978.0], [20.2, 6996.0], [20.3, 7012.0], [20.4, 7050.0], [20.5, 7051.0], [20.6, 7091.0], [20.7, 7116.0], [20.8, 7147.0], [20.9, 7210.0], [21.0, 7231.0], [21.1, 7243.0], [21.2, 7333.0], [21.3, 7360.0], [21.4, 7384.0], [21.5, 7402.0], [21.6, 7443.0], [21.7, 7474.0], [21.8, 7512.0], [21.9, 7646.0], [22.0, 7678.0], [22.1, 7800.0], [22.2, 7816.0], [22.3, 7860.0], [22.4, 7900.0], [22.5, 7940.0], [22.6, 7982.0], [22.7, 7992.0], [22.8, 7998.0], [22.9, 8034.0], [23.0, 8046.0], [23.1, 8069.0], [23.2, 8090.0], [23.3, 8116.0], [23.4, 8143.0], [23.5, 8162.0], [23.6, 8181.0], [23.7, 8195.0], [23.8, 8206.0], [23.9, 8231.0], [24.0, 8249.0], [24.1, 8262.0], [24.2, 8288.0], [24.3, 8326.0], [24.4, 8359.0], [24.5, 8372.0], [24.6, 8384.0], [24.7, 8388.0], [24.8, 8405.0], [24.9, 8427.0], [25.0, 8447.0], [25.1, 8480.0], [25.2, 8494.0], [25.3, 8514.0], [25.4, 8540.0], [25.5, 8545.0], [25.6, 8556.0], [25.7, 8577.0], [25.8, 8582.0], [25.9, 8595.0], [26.0, 8614.0], [26.1, 8630.0], [26.2, 8672.0], [26.3, 8684.0], [26.4, 8707.0], [26.5, 8716.0], [26.6, 8757.0], [26.7, 8776.0], [26.8, 8801.0], [26.9, 8808.0], [27.0, 8853.0], [27.1, 8865.0], [27.2, 8875.0], [27.3, 8936.0], [27.4, 8965.0], [27.5, 9000.0], [27.6, 9021.0], [27.7, 9038.0], [27.8, 9051.0], [27.9, 9069.0], [28.0, 9096.0], [28.1, 9115.0], [28.2, 9129.0], [28.3, 9145.0], [28.4, 9162.0], [28.5, 9184.0], [28.6, 9200.0], [28.7, 9223.0], [28.8, 9236.0], [28.9, 9252.0], [29.0, 9272.0], [29.1, 9284.0], [29.2, 9297.0], [29.3, 9305.0], [29.4, 9327.0], [29.5, 9352.0], [29.6, 9370.0], [29.7, 9383.0], [29.8, 9394.0], [29.9, 9452.0], [30.0, 9460.0], [30.1, 9479.0], [30.2, 9512.0], [30.3, 9522.0], [30.4, 9537.0], [30.5, 9562.0], [30.6, 9580.0], [30.7, 9600.0], [30.8, 9643.0], [30.9, 9681.0], [31.0, 9705.0], [31.1, 9723.0], [31.2, 9736.0], [31.3, 9753.0], [31.4, 9766.0], [31.5, 9784.0], [31.6, 9794.0], [31.7, 9805.0], [31.8, 9844.0], [31.9, 9876.0], [32.0, 9906.0], [32.1, 9913.0], [32.2, 9926.0], [32.3, 9960.0], [32.4, 9981.0], [32.5, 10008.0], [32.6, 10042.0], [32.7, 10060.0], [32.8, 10077.0], [32.9, 10095.0], [33.0, 10127.0], [33.1, 10163.0], [33.2, 10195.0], [33.3, 10210.0], [33.4, 10222.0], [33.5, 10271.0], [33.6, 10296.0], [33.7, 10303.0], [33.8, 10334.0], [33.9, 10346.0], [34.0, 10366.0], [34.1, 10381.0], [34.2, 10423.0], [34.3, 10439.0], [34.4, 10473.0], [34.5, 10479.0], [34.6, 10501.0], [34.7, 10521.0], [34.8, 10541.0], [34.9, 10549.0], [35.0, 10577.0], [35.1, 10621.0], [35.2, 10641.0], [35.3, 10666.0], [35.4, 10686.0], [35.5, 10706.0], [35.6, 10722.0], [35.7, 10734.0], [35.8, 10743.0], [35.9, 10772.0], [36.0, 10789.0], [36.1, 10823.0], [36.2, 10844.0], [36.3, 10849.0], [36.4, 10864.0], [36.5, 10900.0], [36.6, 10911.0], [36.7, 10944.0], [36.8, 10976.0], [36.9, 11031.0], [37.0, 11045.0], [37.1, 11082.0], [37.2, 11113.0], [37.3, 11130.0], [37.4, 11150.0], [37.5, 11174.0], [37.6, 11213.0], [37.7, 11225.0], [37.8, 11266.0], [37.9, 11309.0], [38.0, 11340.0], [38.1, 11368.0], [38.2, 11414.0], [38.3, 11450.0], [38.4, 11489.0], [38.5, 11518.0], [38.6, 11535.0], [38.7, 11553.0], [38.8, 11575.0], [38.9, 11593.0], [39.0, 11618.0], [39.1, 11641.0], [39.2, 11655.0], [39.3, 11668.0], [39.4, 11690.0], [39.5, 11723.0], [39.6, 11733.0], [39.7, 11758.0], [39.8, 11790.0], [39.9, 11812.0], [40.0, 11835.0], [40.1, 11872.0], [40.2, 11881.0], [40.3, 11897.0], [40.4, 11929.0], [40.5, 11939.0], [40.6, 11960.0], [40.7, 11972.0], [40.8, 12008.0], [40.9, 12013.0], [41.0, 12112.0], [41.1, 12118.0], [41.2, 12152.0], [41.3, 12183.0], [41.4, 12221.0], [41.5, 12226.0], [41.6, 12243.0], [41.7, 12291.0], [41.8, 12336.0], [41.9, 12355.0], [42.0, 12384.0], [42.1, 12400.0], [42.2, 12451.0], [42.3, 12466.0], [42.4, 12500.0], [42.5, 12535.0], [42.6, 12552.0], [42.7, 12570.0], [42.8, 12598.0], [42.9, 12645.0], [43.0, 12652.0], [43.1, 12657.0], [43.2, 12671.0], [43.3, 12698.0], [43.4, 12710.0], [43.5, 12722.0], [43.6, 12732.0], [43.7, 12737.0], [43.8, 12751.0], [43.9, 12768.0], [44.0, 12785.0], [44.1, 12794.0], [44.2, 12802.0], [44.3, 12804.0], [44.4, 12824.0], [44.5, 12830.0], [44.6, 12864.0], [44.7, 12875.0], [44.8, 12881.0], [44.9, 12904.0], [45.0, 12918.0], [45.1, 12937.0], [45.2, 12953.0], [45.3, 12962.0], [45.4, 12992.0], [45.5, 13022.0], [45.6, 13047.0], [45.7, 13062.0], [45.8, 13078.0], [45.9, 13106.0], [46.0, 13133.0], [46.1, 13154.0], [46.2, 13163.0], [46.3, 13199.0], [46.4, 13201.0], [46.5, 13215.0], [46.6, 13229.0], [46.7, 13264.0], [46.8, 13278.0], [46.9, 13312.0], [47.0, 13328.0], [47.1, 13341.0], [47.2, 13357.0], [47.3, 13391.0], [47.4, 13417.0], [47.5, 13431.0], [47.6, 13450.0], [47.7, 13458.0], [47.8, 13471.0], [47.9, 13485.0], [48.0, 13498.0], [48.1, 13524.0], [48.2, 13536.0], [48.3, 13553.0], [48.4, 13568.0], [48.5, 13594.0], [48.6, 13628.0], [48.7, 13661.0], [48.8, 13663.0], [48.9, 13679.0], [49.0, 13694.0], [49.1, 13743.0], [49.2, 13776.0], [49.3, 13800.0], [49.4, 13818.0], [49.5, 13858.0], [49.6, 13888.0], [49.7, 13899.0], [49.8, 13907.0], [49.9, 13917.0], [50.0, 13952.0], [50.1, 13991.0], [50.2, 13997.0], [50.3, 14022.0], [50.4, 14025.0], [50.5, 14034.0], [50.6, 14050.0], [50.7, 14075.0], [50.8, 14099.0], [50.9, 14110.0], [51.0, 14130.0], [51.1, 14136.0], [51.2, 14148.0], [51.3, 14174.0], [51.4, 14192.0], [51.5, 14223.0], [51.6, 14246.0], [51.7, 14268.0], [51.8, 14280.0], [51.9, 14290.0], [52.0, 14327.0], [52.1, 14347.0], [52.2, 14359.0], [52.3, 14402.0], [52.4, 14429.0], [52.5, 14469.0], [52.6, 14486.0], [52.7, 14496.0], [52.8, 14529.0], [52.9, 14545.0], [53.0, 14556.0], [53.1, 14570.0], [53.2, 14593.0], [53.3, 14620.0], [53.4, 14641.0], [53.5, 14651.0], [53.6, 14666.0], [53.7, 14679.0], [53.8, 14694.0], [53.9, 14704.0], [54.0, 14741.0], [54.1, 14765.0], [54.2, 14817.0], [54.3, 14836.0], [54.4, 14842.0], [54.5, 14861.0], [54.6, 14889.0], [54.7, 14917.0], [54.8, 14932.0], [54.9, 14941.0], [55.0, 14961.0], [55.1, 14986.0], [55.2, 15014.0], [55.3, 15032.0], [55.4, 15068.0], [55.5, 15085.0], [55.6, 15110.0], [55.7, 15139.0], [55.8, 15152.0], [55.9, 15169.0], [56.0, 15200.0], [56.1, 15235.0], [56.2, 15255.0], [56.3, 15275.0], [56.4, 15296.0], [56.5, 15315.0], [56.6, 15370.0], [56.7, 15397.0], [56.8, 15409.0], [56.9, 15421.0], [57.0, 15439.0], [57.1, 15449.0], [57.2, 15477.0], [57.3, 15494.0], [57.4, 15511.0], [57.5, 15521.0], [57.6, 15538.0], [57.7, 15557.0], [57.8, 15638.0], [57.9, 15661.0], [58.0, 15686.0], [58.1, 15698.0], [58.2, 15709.0], [58.3, 15718.0], [58.4, 15743.0], [58.5, 15774.0], [58.6, 15791.0], [58.7, 15865.0], [58.8, 15889.0], [58.9, 15902.0], [59.0, 15908.0], [59.1, 15926.0], [59.2, 15944.0], [59.3, 15961.0], [59.4, 15975.0], [59.5, 16021.0], [59.6, 16030.0], [59.7, 16040.0], [59.8, 16071.0], [59.9, 16098.0], [60.0, 16112.0], [60.1, 16157.0], [60.2, 16182.0], [60.3, 16208.0], [60.4, 16235.0], [60.5, 16304.0], [60.6, 16331.0], [60.7, 16367.0], [60.8, 16404.0], [60.9, 16452.0], [61.0, 16521.0], [61.1, 16611.0], [61.2, 16661.0], [61.3, 16752.0], [61.4, 16802.0], [61.5, 16830.0], [61.6, 16850.0], [61.7, 16905.0], [61.8, 16958.0], [61.9, 16977.0], [62.0, 17013.0], [62.1, 17021.0], [62.2, 17088.0], [62.3, 17133.0], [62.4, 17256.0], [62.5, 17273.0], [62.6, 17283.0], [62.7, 17311.0], [62.8, 17324.0], [62.9, 17351.0], [63.0, 17365.0], [63.1, 17398.0], [63.2, 17424.0], [63.3, 17439.0], [63.4, 17459.0], [63.5, 17466.0], [63.6, 17495.0], [63.7, 17540.0], [63.8, 17585.0], [63.9, 17600.0], [64.0, 17625.0], [64.1, 17655.0], [64.2, 17662.0], [64.3, 17691.0], [64.4, 17728.0], [64.5, 17747.0], [64.6, 17753.0], [64.7, 17774.0], [64.8, 17785.0], [64.9, 17801.0], [65.0, 17811.0], [65.1, 17816.0], [65.2, 17821.0], [65.3, 17855.0], [65.4, 17872.0], [65.5, 17876.0], [65.6, 17887.0], [65.7, 17915.0], [65.8, 17957.0], [65.9, 17966.0], [66.0, 17982.0], [66.1, 17996.0], [66.2, 18025.0], [66.3, 18041.0], [66.4, 18060.0], [66.5, 18090.0], [66.6, 18117.0], [66.7, 18142.0], [66.8, 18154.0], [66.9, 18164.0], [67.0, 18217.0], [67.1, 18242.0], [67.2, 18272.0], [67.3, 18278.0], [67.4, 18299.0], [67.5, 18313.0], [67.6, 18322.0], [67.7, 18353.0], [67.8, 18371.0], [67.9, 18385.0], [68.0, 18392.0], [68.1, 18396.0], [68.2, 18410.0], [68.3, 18429.0], [68.4, 18438.0], [68.5, 18445.0], [68.6, 18460.0], [68.7, 18470.0], [68.8, 18494.0], [68.9, 18537.0], [69.0, 18556.0], [69.1, 18574.0], [69.2, 18585.0], [69.3, 18591.0], [69.4, 18621.0], [69.5, 18645.0], [69.6, 18651.0], [69.7, 18677.0], [69.8, 18681.0], [69.9, 18698.0], [70.0, 18711.0], [70.1, 18730.0], [70.2, 18738.0], [70.3, 18744.0], [70.4, 18762.0], [70.5, 18773.0], [70.6, 18786.0], [70.7, 18809.0], [70.8, 18819.0], [70.9, 18825.0], [71.0, 18836.0], [71.1, 18853.0], [71.2, 18877.0], [71.3, 18885.0], [71.4, 18894.0], [71.5, 18902.0], [71.6, 18915.0], [71.7, 18933.0], [71.8, 18944.0], [71.9, 18988.0], [72.0, 18998.0], [72.1, 19028.0], [72.2, 19046.0], [72.3, 19057.0], [72.4, 19070.0], [72.5, 19076.0], [72.6, 19098.0], [72.7, 19118.0], [72.8, 19126.0], [72.9, 19138.0], [73.0, 19156.0], [73.1, 19174.0], [73.2, 19204.0], [73.3, 19210.0], [73.4, 19262.0], [73.5, 19277.0], [73.6, 19290.0], [73.7, 19304.0], [73.8, 19324.0], [73.9, 19363.0], [74.0, 19380.0], [74.1, 19394.0], [74.2, 19408.0], [74.3, 19411.0], [74.4, 19414.0], [74.5, 19467.0], [74.6, 19485.0], [74.7, 19493.0], [74.8, 19507.0], [74.9, 19529.0], [75.0, 19552.0], [75.1, 19592.0], [75.2, 19598.0], [75.3, 19639.0], [75.4, 19668.0], [75.5, 19674.0], [75.6, 19704.0], [75.7, 19720.0], [75.8, 19731.0], [75.9, 19740.0], [76.0, 19743.0], [76.1, 19754.0], [76.2, 19764.0], [76.3, 19792.0], [76.4, 19818.0], [76.5, 19841.0], [76.6, 19876.0], [76.7, 19894.0], [76.8, 19910.0], [76.9, 19943.0], [77.0, 19967.0], [77.1, 19982.0], [77.2, 19995.0], [77.3, 20005.0], [77.4, 20050.0], [77.5, 20056.0], [77.6, 20067.0], [77.7, 20094.0], [77.8, 20109.0], [77.9, 20127.0], [78.0, 20154.0], [78.1, 20176.0], [78.2, 20217.0], [78.3, 20232.0], [78.4, 20248.0], [78.5, 20279.0], [78.6, 20309.0], [78.7, 20330.0], [78.8, 20359.0], [78.9, 20376.0], [79.0, 20384.0], [79.1, 20399.0], [79.2, 20434.0], [79.3, 20450.0], [79.4, 20463.0], [79.5, 20512.0], [79.6, 20527.0], [79.7, 20541.0], [79.8, 20575.0], [79.9, 20604.0], [80.0, 20672.0], [80.1, 20706.0], [80.2, 20762.0], [80.3, 20764.0], [80.4, 20779.0], [80.5, 20807.0], [80.6, 20821.0], [80.7, 20871.0], [80.8, 20893.0], [80.9, 20906.0], [81.0, 20979.0], [81.1, 21041.0], [81.2, 21139.0], [81.3, 21162.0], [81.4, 21253.0], [81.5, 21340.0], [81.6, 21393.0], [81.7, 21518.0], [81.8, 21563.0], [81.9, 21570.0], [82.0, 21615.0], [82.1, 21635.0], [82.2, 21673.0], [82.3, 21697.0], [82.4, 21711.0], [82.5, 21768.0], [82.6, 21793.0], [82.7, 21806.0], [82.8, 21833.0], [82.9, 21885.0], [83.0, 21916.0], [83.1, 21940.0], [83.2, 21966.0], [83.3, 22004.0], [83.4, 22026.0], [83.5, 22051.0], [83.6, 22094.0], [83.7, 22106.0], [83.8, 22139.0], [83.9, 22182.0], [84.0, 22223.0], [84.1, 22238.0], [84.2, 22256.0], [84.3, 22275.0], [84.4, 22337.0], [84.5, 22374.0], [84.6, 22418.0], [84.7, 22472.0], [84.8, 22502.0], [84.9, 22513.0], [85.0, 22561.0], [85.1, 22566.0], [85.2, 22588.0], [85.3, 22607.0], [85.4, 22645.0], [85.5, 22687.0], [85.6, 22725.0], [85.7, 22751.0], [85.8, 22767.0], [85.9, 22781.0], [86.0, 22813.0], [86.1, 22822.0], [86.2, 22901.0], [86.3, 22918.0], [86.4, 22961.0], [86.5, 22964.0], [86.6, 22982.0], [86.7, 22988.0], [86.8, 22999.0], [86.9, 23014.0], [87.0, 23023.0], [87.1, 23049.0], [87.2, 23073.0], [87.3, 23088.0], [87.4, 23089.0], [87.5, 23102.0], [87.6, 23116.0], [87.7, 23123.0], [87.8, 23142.0], [87.9, 23147.0], [88.0, 23164.0], [88.1, 23171.0], [88.2, 23197.0], [88.3, 23210.0], [88.4, 23218.0], [88.5, 23230.0], [88.6, 23244.0], [88.7, 23252.0], [88.8, 23254.0], [88.9, 23276.0], [89.0, 23284.0], [89.1, 23291.0], [89.2, 23308.0], [89.3, 23320.0], [89.4, 23322.0], [89.5, 23339.0], [89.6, 23342.0], [89.7, 23355.0], [89.8, 23368.0], [89.9, 23378.0], [90.0, 23381.0], [90.1, 23389.0], [90.2, 23396.0], [90.3, 23399.0], [90.4, 23411.0], [90.5, 23420.0], [90.6, 23441.0], [90.7, 23448.0], [90.8, 23452.0], [90.9, 23465.0], [91.0, 23479.0], [91.1, 23490.0], [91.2, 23495.0], [91.3, 23499.0], [91.4, 23507.0], [91.5, 23519.0], [91.6, 23532.0], [91.7, 23542.0], [91.8, 23550.0], [91.9, 23559.0], [92.0, 23568.0], [92.1, 23580.0], [92.2, 23591.0], [92.3, 23595.0], [92.4, 23608.0], [92.5, 23619.0], [92.6, 23625.0], [92.7, 23640.0], [92.8, 23660.0], [92.9, 23665.0], [93.0, 23673.0], [93.1, 23711.0], [93.2, 23724.0], [93.3, 23760.0], [93.4, 23772.0], [93.5, 23812.0], [93.6, 23831.0], [93.7, 23837.0], [93.8, 23865.0], [93.9, 23874.0], [94.0, 23883.0], [94.1, 23898.0], [94.2, 23906.0], [94.3, 23915.0], [94.4, 23925.0], [94.5, 23931.0], [94.6, 23942.0], [94.7, 23950.0], [94.8, 23963.0], [94.9, 23972.0], [95.0, 23988.0], [95.1, 23996.0], [95.2, 24005.0], [95.3, 24022.0], [95.4, 24026.0], [95.5, 24043.0], [95.6, 24069.0], [95.7, 24088.0], [95.8, 24106.0], [95.9, 24124.0], [96.0, 24132.0], [96.1, 24154.0], [96.2, 24171.0], [96.3, 24184.0], [96.4, 24203.0], [96.5, 24219.0], [96.6, 24221.0], [96.7, 24244.0], [96.8, 24258.0], [96.9, 24273.0], [97.0, 24304.0], [97.1, 24321.0], [97.2, 24349.0], [97.3, 24371.0], [97.4, 24406.0], [97.5, 24438.0], [97.6, 24467.0], [97.7, 24536.0], [97.8, 24570.0], [97.9, 24599.0], [98.0, 24627.0], [98.1, 24652.0], [98.2, 24689.0], [98.3, 24702.0], [98.4, 24748.0], [98.5, 24807.0], [98.6, 24886.0], [98.7, 24945.0], [98.8, 25053.0], [98.9, 25071.0], [99.0, 25110.0], [99.1, 25146.0], [99.2, 25209.0], [99.3, 25304.0], [99.4, 25390.0], [99.5, 25435.0], [99.6, 25586.0], [99.7, 25708.0], [99.8, 25841.0], [99.9, 26026.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 800.0, "maxY": 35.0, "series": [{"data": [[800.0, 1.0], [900.0, 2.0], [1000.0, 13.0], [1100.0, 8.0], [1200.0, 4.0], [1300.0, 5.0], [1400.0, 3.0], [1500.0, 4.0], [1600.0, 6.0], [1700.0, 5.0], [1800.0, 10.0], [1900.0, 5.0], [2000.0, 6.0], [2100.0, 1.0], [2300.0, 3.0], [2200.0, 2.0], [2400.0, 4.0], [2500.0, 3.0], [2600.0, 6.0], [2700.0, 1.0], [2800.0, 1.0], [3300.0, 6.0], [3200.0, 2.0], [3400.0, 5.0], [3500.0, 9.0], [3600.0, 10.0], [3700.0, 7.0], [3800.0, 7.0], [3900.0, 5.0], [4000.0, 5.0], [4200.0, 27.0], [4100.0, 19.0], [4300.0, 17.0], [4400.0, 12.0], [4600.0, 19.0], [4500.0, 17.0], [4700.0, 13.0], [4800.0, 16.0], [4900.0, 20.0], [5100.0, 19.0], [5000.0, 18.0], [5200.0, 22.0], [5300.0, 23.0], [5400.0, 17.0], [5500.0, 18.0], [5600.0, 15.0], [5700.0, 12.0], [5800.0, 19.0], [6000.0, 18.0], [5900.0, 11.0], [6100.0, 17.0], [6200.0, 11.0], [6300.0, 14.0], [6400.0, 11.0], [6500.0, 19.0], [6600.0, 11.0], [6800.0, 6.0], [6900.0, 9.0], [6700.0, 7.0], [7000.0, 12.0], [7100.0, 8.0], [7200.0, 8.0], [7300.0, 9.0], [7400.0, 9.0], [7600.0, 5.0], [7500.0, 3.0], [7900.0, 14.0], [7700.0, 2.0], [7800.0, 9.0], [8000.0, 12.0], [8100.0, 15.0], [8200.0, 15.0], [8400.0, 14.0], [8300.0, 15.0], [8500.0, 22.0], [8600.0, 13.0], [8700.0, 12.0], [8800.0, 13.0], [9000.0, 16.0], [9100.0, 17.0], [9200.0, 19.0], [8900.0, 8.0], [9300.0, 18.0], [9400.0, 10.0], [9700.0, 20.0], [9600.0, 9.0], [9500.0, 16.0], [9900.0, 16.0], [10000.0, 13.0], [9800.0, 9.0], [10200.0, 14.0], [10100.0, 9.0], [10300.0, 14.0], [10400.0, 13.0], [10500.0, 14.0], [10600.0, 13.0], [10700.0, 16.0], [10800.0, 14.0], [11000.0, 11.0], [10900.0, 10.0], [11200.0, 10.0], [11100.0, 11.0], [11300.0, 8.0], [11400.0, 8.0], [11500.0, 15.0], [11600.0, 15.0], [11700.0, 13.0], [11900.0, 14.0], [12200.0, 13.0], [12000.0, 5.0], [11800.0, 14.0], [12100.0, 12.0], [12400.0, 9.0], [12300.0, 9.0], [12500.0, 13.0], [12700.0, 25.0], [12600.0, 15.0], [13000.0, 15.0], [12900.0, 16.0], [13300.0, 14.0], [13200.0, 17.0], [12800.0, 22.0], [13100.0, 13.0], [13400.0, 20.0], [13500.0, 15.0], [13600.0, 16.0], [13800.0, 13.0], [13700.0, 7.0], [14200.0, 16.0], [14000.0, 17.0], [14100.0, 18.0], [13900.0, 16.0], [14300.0, 10.0], [14400.0, 14.0], [14500.0, 15.0], [14600.0, 18.0], [14700.0, 8.0], [14800.0, 16.0], [15200.0, 13.0], [14900.0, 16.0], [15100.0, 12.0], [15000.0, 12.0], [15300.0, 9.0], [15500.0, 12.0], [15800.0, 6.0], [15400.0, 19.0], [15600.0, 11.0], [15700.0, 16.0], [15900.0, 18.0], [16000.0, 14.0], [16100.0, 10.0], [16300.0, 9.0], [16200.0, 7.0], [17200.0, 11.0], [16800.0, 8.0], [17000.0, 9.0], [16600.0, 6.0], [16400.0, 5.0], [17400.0, 15.0], [17800.0, 23.0], [17600.0, 14.0], [18000.0, 14.0], [18400.0, 22.0], [18200.0, 13.0], [18600.0, 17.0], [19400.0, 20.0], [18800.0, 25.0], [19000.0, 18.0], [19200.0, 15.0], [19600.0, 11.0], [20200.0, 13.0], [19800.0, 11.0], [20000.0, 15.0], [20400.0, 11.0], [20800.0, 12.0], [20600.0, 7.0], [21200.0, 3.0], [21000.0, 3.0], [21400.0, 2.0], [21600.0, 13.0], [21800.0, 8.0], [22000.0, 11.0], [22200.0, 11.0], [22400.0, 7.0], [23200.0, 27.0], [23400.0, 30.0], [22800.0, 7.0], [23000.0, 20.0], [22600.0, 9.0], [23600.0, 21.0], [23800.0, 19.0], [24000.0, 19.0], [24200.0, 17.0], [24400.0, 8.0], [24600.0, 10.0], [25000.0, 6.0], [24800.0, 6.0], [25200.0, 3.0], [25400.0, 3.0], [25600.0, 2.0], [25800.0, 3.0], [26200.0, 1.0], [26000.0, 1.0], [16500.0, 3.0], [16700.0, 4.0], [16900.0, 8.0], [17100.0, 3.0], [17300.0, 13.0], [17500.0, 8.0], [17700.0, 16.0], [17900.0, 14.0], [18100.0, 12.0], [18300.0, 21.0], [18500.0, 15.0], [18700.0, 22.0], [18900.0, 16.0], [19100.0, 16.0], [19300.0, 14.0], [19500.0, 13.0], [19700.0, 23.0], [19900.0, 16.0], [20100.0, 11.0], [20300.0, 17.0], [20500.0, 11.0], [20700.0, 11.0], [20900.0, 5.0], [21300.0, 5.0], [21100.0, 7.0], [21500.0, 8.0], [21700.0, 9.0], [22300.0, 6.0], [22100.0, 10.0], [21900.0, 10.0], [22500.0, 15.0], [23100.0, 23.0], [23300.0, 35.0], [22900.0, 19.0], [22700.0, 11.0], [23500.0, 31.0], [23900.0, 31.0], [24100.0, 18.0], [24300.0, 13.0], [23700.0, 13.0], [24500.0, 8.0], [24700.0, 7.0], [25100.0, 7.0], [24900.0, 2.0], [25300.0, 5.0], [25500.0, 2.0], [26100.0, 1.0], [25700.0, 2.0], [25900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 26200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 36.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2964.0, "series": [{"data": [[1.0, 36.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2964.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 580.0336496980148, "minX": 1.54958358E12, "maxY": 1773.9902227050477, "series": [{"data": [[1.54958358E12, 1773.9902227050477], [1.54958364E12, 580.0336496980148]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 3367.0, "minX": 1.0, "maxY": 26246.0, "series": [{"data": [[2.0, 24154.0], [3.0, 24184.0], [4.0, 24327.0], [5.0, 24298.0], [6.0, 25641.0], [7.0, 24371.0], [8.0, 24010.0], [9.0, 24134.0], [10.0, 24135.0], [11.0, 25403.0], [12.0, 24627.0], [13.0, 24126.0], [14.0, 24266.0], [16.0, 24009.5], [17.0, 24304.0], [18.0, 24183.0], [20.0, 24413.0], [21.0, 24536.0], [23.0, 24213.5], [24.0, 24463.0], [25.0, 24033.0], [26.0, 23953.0], [27.0, 26026.0], [28.0, 24537.0], [29.0, 26246.0], [30.0, 24005.0], [31.0, 24043.0], [33.0, 24225.0], [32.0, 23998.0], [35.0, 24124.0], [34.0, 24023.0], [37.0, 24605.0], [36.0, 24207.0], [39.0, 24657.0], [38.0, 23948.0], [41.0, 24503.5], [43.0, 24128.0], [42.0, 25872.0], [45.0, 25833.0], [44.0, 24097.0], [47.0, 24252.0], [46.0, 24371.0], [49.0, 25841.0], [48.0, 24886.0], [51.0, 23915.0], [50.0, 24221.0], [53.0, 24069.0], [52.0, 25708.0], [54.0, 23883.0], [57.0, 25390.0], [56.0, 25074.0], [59.0, 24081.0], [58.0, 23925.0], [61.0, 23906.0], [60.0, 24004.0], [63.0, 24406.0], [62.0, 25719.0], [67.0, 23987.0], [66.0, 23868.0], [65.0, 24258.0], [64.0, 26165.0], [70.0, 23566.0], [69.0, 25110.0], [68.0, 23925.0], [75.0, 23465.0], [74.0, 23519.0], [73.0, 23476.0], [72.0, 23665.0], [78.0, 23657.5], [77.0, 23772.0], [83.0, 24089.0], [82.0, 23887.0], [81.0, 23533.0], [80.0, 23910.5], [87.0, 23724.0], [86.0, 23479.0], [85.0, 23568.0], [84.0, 23595.0], [91.0, 23441.0], [90.0, 23595.0], [89.0, 23632.0], [88.0, 23457.0], [94.0, 23799.0], [93.0, 23591.0], [99.0, 25327.0], [98.0, 24813.0], [97.0, 25061.0], [96.0, 23749.0], [103.0, 24758.0], [102.0, 23660.0], [101.0, 23740.5], [107.0, 23668.0], [106.0, 23464.0], [105.0, 23732.0], [104.0, 23422.0], [111.0, 23996.0], [110.0, 23989.0], [109.0, 24316.0], [108.0, 23401.0], [115.0, 23570.0], [114.0, 23769.0], [113.0, 23491.0], [112.0, 23659.0], [119.0, 25654.0], [118.0, 23950.0], [117.0, 23865.0], [116.0, 23913.0], [123.0, 23516.0], [122.0, 23558.0], [121.0, 23668.0], [120.0, 23773.0], [127.0, 23507.0], [126.0, 23499.0], [125.0, 23396.0], [135.0, 23417.0], [134.0, 25236.0], [133.0, 24697.0], [132.0, 23375.0], [131.0, 23525.0], [130.0, 24107.0], [129.0, 23419.0], [128.0, 23610.0], [143.0, 23373.0], [142.0, 25094.0], [141.0, 23847.0], [140.0, 25146.0], [139.0, 23531.5], [138.0, 23450.0], [136.0, 23341.0], [151.0, 23760.0], [150.0, 23665.0], [149.0, 23322.0], [148.0, 23593.0], [147.0, 23711.0], [146.0, 23362.0], [145.0, 23664.0], [144.0, 23542.0], [159.0, 23846.0], [158.0, 24171.0], [157.0, 23623.0], [156.0, 23517.0], [155.0, 23832.0], [154.0, 25053.0], [153.0, 25435.0], [152.0, 24244.0], [167.0, 23321.0], [166.0, 25071.0], [165.0, 23339.0], [164.0, 23448.0], [163.0, 25511.0], [162.0, 25069.0], [161.0, 24567.0], [160.0, 23317.0], [175.0, 23559.0], [174.0, 24967.5], [173.0, 23700.0], [171.0, 23332.0], [170.0, 23498.0], [169.0, 25101.0], [168.0, 23632.0], [183.0, 23407.0], [182.0, 23291.0], [181.0, 24689.0], [180.0, 25209.0], [179.0, 23585.0], [178.0, 24652.0], [177.0, 23490.0], [176.0, 23290.0], [191.0, 23354.0], [190.0, 23326.0], [189.0, 24701.0], [188.0, 24889.0], [187.0, 25499.0], [186.0, 23423.0], [185.0, 23940.0], [184.0, 24205.0], [199.0, 23814.0], [198.0, 24035.0], [197.0, 23396.0], [196.0, 23197.0], [195.0, 24702.0], [194.0, 23355.0], [193.0, 23244.0], [192.0, 23485.0], [207.0, 23368.0], [206.0, 23542.0], [205.0, 24641.0], [204.0, 23142.0], [203.0, 23722.0], [202.0, 23276.0], [201.0, 23939.0], [200.0, 24807.0], [215.0, 23446.0], [214.0, 23280.0], [213.0, 23357.0], [212.0, 23206.0], [211.0, 25131.0], [210.0, 25304.0], [209.0, 23211.0], [208.0, 23169.0], [223.0, 24318.0], [222.0, 25229.0], [221.0, 23293.0], [220.0, 23495.0], [219.0, 23106.0], [218.0, 23640.0], [217.0, 24284.5], [231.0, 24775.0], [230.0, 23578.0], [229.0, 23253.0], [228.0, 23252.0], [227.0, 24169.0], [226.0, 23664.0], [225.0, 23721.0], [239.0, 23972.0], [238.0, 24444.0], [237.0, 23446.0], [236.0, 23393.0], [235.0, 25399.0], [234.0, 23089.0], [233.0, 23712.0], [232.0, 23608.0], [247.0, 23246.0], [246.0, 24025.0], [245.0, 23282.0], [244.0, 23090.0], [243.0, 24895.0], [242.0, 23505.0], [240.0, 24508.0], [255.0, 25188.0], [254.0, 23000.0], [253.0, 23967.0], [252.0, 24627.0], [251.0, 24599.0], [250.0, 24994.0], [249.0, 23784.5], [270.0, 23725.0], [271.0, 24438.0], [269.0, 23171.0], [268.0, 23049.0], [267.0, 23624.0], [266.0, 22999.0], [265.0, 23252.0], [264.0, 23047.0], [263.0, 23342.0], [257.0, 23926.0], [256.0, 23008.0], [259.0, 23218.0], [258.0, 23303.0], [262.0, 23145.0], [261.0, 24945.0], [260.0, 25128.0], [286.0, 23883.0], [287.0, 24484.0], [285.0, 23580.0], [284.0, 25175.0], [283.0, 24663.0], [282.0, 23014.0], [281.0, 23812.0], [280.0, 23073.0], [279.0, 22913.0], [273.0, 24112.0], [272.0, 23532.0], [275.0, 24570.0], [274.0, 24222.0], [278.0, 24715.0], [277.0, 23284.0], [276.0, 23963.0], [302.0, 23089.0], [303.0, 22994.0], [301.0, 24938.5], [291.0, 23044.0], [290.0, 23380.0], [289.0, 24321.0], [288.0, 22964.0], [299.0, 24193.0], [298.0, 23507.0], [296.0, 23946.0], [295.0, 23088.0], [294.0, 22977.0], [293.0, 24382.0], [292.0, 23386.0], [318.0, 23198.0], [319.0, 22698.0], [317.0, 23322.0], [316.0, 23960.0], [315.0, 24219.0], [314.0, 24203.0], [313.0, 24088.0], [312.0, 22725.0], [311.0, 23924.0], [305.0, 22984.0], [304.0, 23549.0], [307.0, 23210.0], [306.0, 23110.0], [310.0, 22961.0], [309.0, 23381.0], [308.0, 24702.0], [334.0, 8711.333333333332], [328.0, 12239.0], [326.0, 12039.0], [325.0, 23762.0], [324.0, 23673.0], [327.0, 24219.0], [321.0, 23317.0], [320.0, 22767.0], [323.0, 23911.0], [322.0, 23054.0], [329.0, 4837.5], [330.0, 6511.5], [335.0, 12218.0], [333.0, 22751.0], [332.0, 22645.0], [331.0, 23164.0], [350.0, 22562.0], [336.0, 12922.0], [338.0, 23507.0], [337.0, 22561.0], [343.0, 24637.0], [342.0, 22687.0], [341.0, 23985.0], [340.0, 23625.0], [339.0, 11957.5], [351.0, 22764.0], [349.0, 24016.0], [348.0, 23693.0], [347.0, 23023.0], [346.0, 22756.0], [345.0, 23877.0], [344.0, 23389.0], [366.0, 24352.0], [367.0, 22527.0], [365.0, 22814.0], [364.0, 23502.0], [363.0, 22737.0], [362.0, 24273.0], [361.0, 23345.0], [360.0, 22547.0], [359.0, 23142.0], [353.0, 24417.0], [352.0, 22611.0], [355.0, 22563.0], [354.0, 23117.0], [358.0, 24106.0], [357.0, 23591.0], [356.0, 23123.0], [383.0, 23017.0], [370.0, 12120.0], [375.0, 22609.0], [369.0, 22901.0], [368.0, 23545.0], [374.0, 22938.0], [373.0, 23550.0], [372.0, 24177.0], [376.0, 11862.0], [382.0, 23210.0], [381.0, 23394.0], [380.0, 23077.0], [371.0, 23900.0], [379.0, 24347.0], [378.0, 22607.0], [377.0, 22785.0], [399.0, 12749.5], [385.0, 11965.5], [391.0, 23099.0], [384.0, 22410.0], [390.0, 23053.0], [389.0, 24132.0], [388.0, 22685.0], [393.0, 11563.5], [398.0, 22339.0], [397.0, 22962.0], [396.0, 23452.0], [387.0, 23082.0], [386.0, 24043.0], [395.0, 23603.0], [394.0, 24267.0], [392.0, 22891.0], [403.0, 12189.0], [400.0, 12223.5], [404.0, 11616.5], [405.0, 23905.0], [402.0, 12548.5], [401.0, 23116.0], [407.0, 11563.5], [406.0, 24074.0], [415.0, 22349.0], [409.0, 24166.0], [408.0, 23166.0], [411.0, 22184.0], [410.0, 22650.0], [414.0, 23219.0], [413.0, 23874.0], [412.0, 22911.0], [431.0, 22170.0], [426.0, 12381.0], [430.0, 22106.0], [429.0, 22977.0], [428.0, 22813.0], [419.0, 22472.0], [418.0, 23230.0], [417.0, 23378.0], [416.0, 22577.0], [427.0, 23832.0], [425.0, 23988.0], [424.0, 22048.0], [423.0, 22588.0], [422.0, 23089.0], [421.0, 22097.0], [420.0, 23308.0], [445.0, 22268.0], [447.0, 23175.0], [434.0, 12452.5], [440.0, 11803.5], [446.0, 22985.0], [444.0, 22773.0], [443.0, 23300.5], [441.0, 23247.0], [439.0, 22045.0], [433.0, 22775.0], [432.0, 23255.0], [438.0, 23154.0], [437.0, 21940.0], [436.0, 22982.5], [462.0, 22491.0], [461.0, 11771.0], [463.0, 22385.0], [460.0, 22509.0], [459.0, 22139.0], [458.0, 22124.0], [457.0, 22918.0], [456.0, 22982.0], [455.0, 21885.0], [448.0, 22009.0], [451.0, 23337.5], [449.0, 22418.0], [454.0, 21768.0], [453.0, 22275.0], [452.0, 22094.0], [478.0, 22502.0], [479.0, 12067.5], [477.0, 22961.0], [476.0, 21673.0], [475.0, 21563.0], [474.0, 22993.0], [473.0, 22781.0], [472.0, 21916.0], [471.0, 22187.0], [465.0, 21699.0], [464.0, 22374.0], [467.0, 22456.0], [466.0, 23181.0], [470.0, 22237.0], [469.0, 22733.0], [468.0, 23397.0], [495.0, 23495.0], [480.0, 11656.5], [481.0, 21624.0], [483.0, 22277.0], [482.0, 21859.0], [491.0, 12018.0], [494.0, 22378.5], [492.0, 22103.0], [490.0, 23284.0], [489.0, 21813.0], [488.0, 22919.0], [487.0, 23132.0], [486.0, 22318.0], [485.0, 22593.0], [484.0, 22587.0], [511.0, 22051.0], [504.0, 11522.0], [510.0, 21537.0], [509.0, 21945.0], [508.0, 21905.0], [499.0, 22267.0], [498.0, 23320.0], [497.0, 21799.0], [496.0, 22069.0], [507.0, 22512.0], [506.0, 21635.0], [505.0, 22004.0], [503.0, 21934.0], [502.0, 21886.0], [501.0, 21806.0], [500.0, 21687.0], [540.0, 22238.0], [520.0, 11551.0], [522.0, 22026.0], [526.0, 21342.0], [514.0, 22238.0], [512.0, 21712.0], [518.0, 21340.0], [516.0, 23147.0], [524.0, 21793.0], [542.0, 22016.0], [538.0, 21416.0], [536.0, 21621.0], [534.0, 21725.0], [532.0, 22535.0], [530.0, 21518.0], [528.0, 21916.0], [572.0, 20305.0], [556.0, 11355.5], [554.0, 20733.0], [552.0, 21783.0], [558.0, 20522.0], [546.0, 22337.0], [544.0, 21697.0], [550.0, 21791.0], [548.0, 21833.0], [574.0, 20764.0], [570.0, 21393.0], [568.0, 21041.0], [566.0, 21566.0], [564.0, 21565.0], [562.0, 21253.0], [560.0, 20536.0], [604.0, 20397.0], [578.0, 11157.5], [586.0, 8099.333333333333], [584.0, 21155.0], [590.0, 20763.0], [576.0, 20706.0], [588.0, 20979.0], [606.0, 20050.0], [602.0, 20802.0], [600.0, 20733.0], [582.0, 20217.0], [580.0, 21135.0], [598.0, 20659.0], [596.0, 21267.0], [594.0, 20232.0], [592.0, 20248.0], [636.0, 20699.0], [610.0, 11133.0], [608.0, 20604.0], [614.0, 20447.0], [612.0, 20922.0], [622.0, 19995.0], [620.0, 20377.0], [618.0, 19917.0], [616.0, 20458.0], [632.0, 10942.5], [638.0, 10876.5], [634.0, 20207.0], [630.0, 19741.0], [628.0, 20814.0], [626.0, 20855.0], [624.0, 20807.0], [668.0, 20339.0], [642.0, 10906.5], [640.0, 11001.5], [654.0, 19529.0], [650.0, 20055.0], [648.0, 20309.0], [646.0, 8038.666666666667], [644.0, 20004.0], [670.0, 10858.0], [658.0, 20762.0], [666.0, 19733.0], [664.0, 20512.0], [662.0, 19612.0], [660.0, 20434.0], [700.0, 10669.0], [682.0, 10982.0], [680.0, 20241.0], [688.0, 10756.0], [702.0, 19901.0], [698.0, 20359.0], [696.0, 19447.0], [692.0, 20558.0], [690.0, 20369.0], [686.0, 19943.0], [674.0, 20480.0], [672.0, 20056.0], [678.0, 20681.0], [676.0, 19576.0], [684.0, 19771.0], [732.0, 19764.0], [734.0, 20527.0], [730.0, 19412.0], [728.0, 19836.0], [726.0, 19865.0], [724.0, 19204.0], [722.0, 19265.0], [720.0, 19488.0], [718.0, 19507.0], [706.0, 20313.0], [704.0, 19245.0], [710.0, 20250.0], [708.0, 20176.0], [716.0, 20018.0], [714.0, 19828.0], [712.0, 20222.0], [764.0, 19479.0], [762.0, 10487.0], [766.0, 19749.0], [760.0, 19158.0], [758.0, 18912.0], [756.0, 19141.0], [752.0, 19288.0], [750.0, 19668.0], [738.0, 20067.0], [736.0, 19639.0], [742.0, 18881.0], [740.0, 18919.0], [746.0, 19597.0], [744.0, 18990.0], [796.0, 19984.0], [798.0, 19695.0], [794.0, 19928.0], [792.0, 19818.0], [790.0, 19114.0], [788.0, 18734.0], [786.0, 19254.0], [784.0, 19862.0], [782.0, 19841.0], [770.0, 18750.0], [768.0, 19410.0], [774.0, 18816.0], [772.0, 18895.0], [780.0, 19797.0], [778.0, 18829.0], [776.0, 18792.0], [828.0, 19277.0], [830.0, 19346.0], [826.0, 19072.0], [824.0, 19210.0], [822.0, 18380.0], [820.0, 19529.0], [818.0, 19401.0], [816.0, 19324.0], [814.0, 19318.0], [802.0, 19203.0], [800.0, 18434.0], [806.0, 18677.0], [804.0, 20224.0], [812.0, 19609.0], [810.0, 20124.0], [808.0, 19098.0], [862.0, 19213.0], [844.0, 10306.0], [842.0, 19349.0], [840.0, 18739.0], [850.0, 10641.0], [860.0, 19073.0], [858.0, 18753.0], [856.0, 18839.0], [838.0, 19068.0], [836.0, 19493.0], [834.0, 19184.0], [832.0, 19095.0], [846.0, 19119.0], [854.0, 18853.0], [852.0, 18824.0], [848.0, 19174.0], [894.0, 18717.0], [880.0, 10770.0], [892.0, 18783.0], [890.0, 18836.0], [888.0, 18706.0], [870.0, 18585.0], [868.0, 19057.0], [866.0, 18621.0], [864.0, 19126.0], [886.0, 18385.0], [884.0, 18599.0], [882.0, 19412.0], [878.0, 18783.0], [876.0, 18645.0], [874.0, 18816.0], [872.0, 18938.0], [924.0, 18300.0], [926.0, 18612.0], [922.0, 18574.0], [920.0, 19740.0], [918.0, 18894.0], [916.0, 18694.0], [912.0, 18711.0], [910.0, 18460.0], [898.0, 19761.0], [896.0, 18994.0], [902.0, 18402.0], [900.0, 18736.0], [908.0, 18681.0], [906.0, 19262.0], [904.0, 18545.0], [956.0, 7724.333333333333], [958.0, 7820.666666666667], [954.0, 19380.0], [952.0, 18438.0], [950.0, 18429.0], [948.0, 18272.0], [946.0, 19304.0], [942.0, 18295.0], [930.0, 18739.0], [928.0, 18556.0], [934.0, 18396.0], [932.0, 18315.0], [940.0, 18353.0], [938.0, 18441.0], [936.0, 18242.0], [990.0, 17652.0], [976.0, 19111.0], [978.0, 17665.0], [980.0, 18156.0], [982.0, 18025.0], [988.0, 17915.0], [986.0, 18738.0], [984.0, 17962.0], [970.0, 10394.5], [972.0, 18272.0], [974.0, 17880.0], [960.0, 10824.5], [968.0, 10638.5], [966.0, 10377.0], [964.0, 10778.5], [962.0, 10362.0], [1020.0, 18730.0], [1008.0, 17826.0], [1010.0, 18456.0], [1012.0, 17888.0], [1022.0, 17814.0], [1018.0, 17612.0], [1016.0, 17656.0], [992.0, 18357.0], [994.0, 18395.0], [996.0, 18679.0], [998.0, 17903.0], [1006.0, 17600.0], [1004.0, 18041.0], [1002.0, 18151.0], [1000.0, 18915.0], [1014.0, 17540.0], [1080.0, 18095.0], [1056.0, 17430.0], [1060.0, 17133.0], [1064.0, 18169.0], [1084.0, 18043.0], [1076.0, 17273.0], [1072.0, 17345.0], [1024.0, 17788.0], [1028.0, 17774.0], [1032.0, 17467.0], [1036.0, 18156.0], [1052.0, 17581.0], [1048.0, 19402.0], [1044.0, 18497.0], [1040.0, 17459.0], [1068.0, 18306.0], [1144.0, 17782.0], [1120.0, 17285.0], [1124.0, 17625.0], [1128.0, 17550.0], [1148.0, 16967.0], [1140.0, 17777.0], [1136.0, 17820.0], [1088.0, 18094.0], [1092.0, 16905.0], [1096.0, 17249.0], [1100.0, 17993.0], [1116.0, 16930.0], [1112.0, 17882.0], [1108.0, 17424.0], [1104.0, 17984.0], [1132.0, 17817.0], [1152.0, 16397.0], [1200.0, 9662.0], [1212.0, 16521.0], [1180.0, 7822.0], [1176.0, 16785.0], [1172.0, 16816.0], [1168.0, 16235.0], [1156.0, 16405.5], [1160.0, 15973.0], [1164.0, 16331.0], [1184.0, 9862.0], [1188.0, 10062.0], [1192.0, 16157.0], [1196.0, 16172.0], [1204.0, 15975.0], [1208.0, 15827.0], [1220.0, 15709.0], [1272.0, 15889.0], [1228.0, 9881.0], [1216.0, 15698.0], [1224.0, 3367.0], [1232.0, 6518.25], [1236.0, 15494.0], [1240.0, 15623.0], [1244.0, 15449.0], [1264.0, 15921.0], [1268.0, 15392.0], [1248.0, 15708.0], [1252.0, 15854.0], [1256.0, 15791.0], [1260.0, 15692.0], [1276.0, 15815.0], [1280.0, 15411.0], [1336.0, 15064.0], [1300.0, 5958.5], [1296.0, 15296.0], [1304.0, 15315.0], [1284.0, 16843.0], [1308.0, 15457.0], [1312.0, 14961.0], [1316.0, 15449.0], [1320.0, 14836.0], [1324.0, 15429.0], [1340.0, 14556.0], [1332.0, 14641.0], [1328.0, 14897.0], [1292.0, 15314.0], [1288.0, 15774.0], [1344.0, 14861.0], [1400.0, 14686.0], [1352.0, 15235.0], [1348.0, 15195.0], [1356.0, 14694.0], [1372.0, 14932.0], [1368.0, 14917.0], [1364.0, 15015.0], [1360.0, 15068.0], [1376.0, 14838.0], [1380.0, 14615.0], [1384.0, 14842.0], [1388.0, 14487.0], [1404.0, 14402.0], [1396.0, 14674.0], [1392.0, 14585.0], [1464.0, 14027.0], [1440.0, 14233.0], [1444.0, 14148.0], [1448.0, 14136.0], [1468.0, 13875.0], [1460.0, 13995.0], [1456.0, 14007.0], [1408.0, 14160.0], [1412.0, 14439.0], [1416.0, 14479.0], [1420.0, 14499.0], [1436.0, 13496.0], [1432.0, 15274.0], [1428.0, 14339.0], [1424.0, 14183.0], [1452.0, 14134.0], [1532.0, 13345.0], [1504.0, 13630.0], [1508.0, 9374.0], [1516.0, 13485.0], [1512.0, 13435.0], [1528.0, 13391.0], [1524.0, 13450.0], [1520.0, 13498.0], [1484.0, 13681.0], [1480.0, 13814.0], [1476.0, 13628.0], [1472.0, 13899.0], [1500.0, 13632.0], [1496.0, 13679.0], [1492.0, 13667.0], [1536.0, 13269.0], [1552.0, 6928.666666666666], [1556.0, 13132.0], [1560.0, 13078.0], [1540.0, 13229.0], [1544.0, 13201.0], [1548.0, 13133.0], [1564.0, 13037.0], [1572.0, 8900.5], [1568.0, 12942.0], [1576.0, 12875.0], [1580.0, 13995.0], [1596.0, 14024.0], [1592.0, 13807.0], [1588.0, 12802.0], [1584.0, 12704.0], [1600.0, 8933.5], [1652.0, 8165.0], [1628.0, 13464.0], [1624.0, 13558.0], [1620.0, 12563.0], [1616.0, 13663.0], [1604.0, 8362.0], [1648.0, 12242.0], [1612.0, 12662.0], [1608.0, 13898.0], [1632.0, 12451.0], [1636.0, 12451.0], [1640.0, 12359.0], [1644.0, 13458.0], [1660.0, 12172.0], [1656.0, 13201.0], [1692.0, 7873.0], [1720.0, 12750.0], [1696.0, 7900.5], [1716.0, 12830.0], [1724.0, 11712.0], [1680.0, 11960.0], [1684.0, 14599.0], [1688.0, 11952.0], [1664.0, 12117.0], [1668.0, 12113.0], [1672.0, 13062.0], [1676.0, 12009.0], [1712.0, 13020.0], [1708.0, 12875.0], [1704.0, 9168.5], [1700.0, 11891.0], [1732.0, 11592.0], [1740.0, 11626.0], [1780.0, 8167.5], [1736.0, 8003.0], [1776.0, 13292.0], [1752.0, 11591.0], [1744.0, 12826.0], [1756.0, 8599.5], [1728.0, 11685.0], [1764.0, 8886.0], [1772.0, 7482.5], [1768.0, 12646.0], [1784.0, 8149.5], [1760.0, 14246.0], [1788.0, 13278.0], [1796.0, 11752.0], [1824.0, 6680.5], [1792.0, 8099.5], [1800.0, 10488.0], [1844.0, 8452.5], [1840.0, 10845.0], [1804.0, 13185.0], [1848.0, 12047.0], [1852.0, 12295.0], [1820.0, 11382.0], [1816.0, 11329.0], [1812.0, 12429.0], [1808.0, 11368.0], [1828.0, 12430.0], [1832.0, 11188.0], [1836.0, 8270.5], [1868.0, 7728.5], [1904.0, 8208.5], [1880.0, 7712.0], [1908.0, 6493.75], [1912.0, 8060.5], [1916.0, 11217.0], [1872.0, 10345.0], [1876.0, 7921.0], [1884.0, 10686.0], [1864.0, 12188.0], [1896.0, 10549.0], [1900.0, 11411.0], [1892.0, 12008.0], [1928.0, 7002.666666666666], [1920.0, 7683.0], [1948.0, 10008.0], [1924.0, 11919.0], [1932.0, 10908.0], [1968.0, 10586.0], [1972.0, 11337.0], [1952.0, 11003.0], [1980.0, 11113.0], [1976.0, 11354.0], [1956.0, 7557.0], [1960.0, 10743.0], [1964.0, 7543.0], [1936.0, 6799.666666666667], [1940.0, 11534.0], [1944.0, 6599.5], [1996.0, 7755.0], [1992.0, 5279.5], [1988.0, 11152.0], [1984.0, 9145.0], [2008.0, 10477.0], [2012.0, 6143.833333333333], [2032.0, 7324.0], [2036.0, 10210.0], [2040.0, 10351.0], [2016.0, 10127.0], [2020.0, 10823.0], [2024.0, 10200.0], [2044.0, 9129.0], [2028.0, 7344.0], [2000.0, 7899.5], [2004.0, 9536.0], [2056.0, 7114.5], [2104.0, 10058.0], [2096.0, 6420.0], [2080.0, 10021.0], [2088.0, 9723.0], [2064.0, 8494.0], [2072.0, 8509.0], [2144.0, 9643.0], [2160.0, 9456.0], [2152.0, 9327.0], [2120.0, 9876.0], [2112.0, 8692.0], [2128.0, 9562.0], [2136.0, 7368.5], [2184.0, 6688.75], [2224.0, 8865.0], [2176.0, 7614.5], [2232.0, 8564.0], [2216.0, 7482.5], [2208.0, 7245.5], [2192.0, 9344.0], [2200.0, 9017.0], [2272.0, 8132.0], [2288.0, 8776.0], [2296.0, 8724.0], [2240.0, 7376.5], [2264.0, 8595.0], [2256.0, 8710.0], [2248.0, 7654.0], [2312.0, 6486.0], [2320.0, 7493.0], [2328.0, 8652.0], [2400.0, 7081.0], [2336.0, 7435.5], [2304.0, 7989.0], [2360.0, 8402.0], [2352.0, 7940.0], [2344.0, 7800.0], [2408.0, 6891.5], [2416.0, 6662.0], [2424.0, 6758.0], [2368.0, 7020.5], [2392.0, 7239.0], [2384.0, 7051.0], [2376.0, 7443.0], [2440.0, 6520.0], [2432.0, 6588.0], [2448.0, 6334.5], [2456.0, 6347.0], [2049.0, 7671.75], [2057.0, 8997.0], [2089.0, 7710.0], [2105.0, 10077.0], [2097.0, 10095.0], [2081.0, 8803.0], [2065.0, 8985.0], [2073.0, 10334.0], [2145.0, 7982.0], [2121.0, 9386.0], [2113.0, 8193.0], [2153.0, 6275.5], [2169.0, 9085.0], [2129.0, 8034.0], [2137.0, 5784.0], [2185.0, 8041.0], [2177.0, 8206.0], [2233.0, 9022.0], [2225.0, 7110.0], [2217.0, 7623.5], [2209.0, 9204.0], [2193.0, 7535.5], [2273.0, 8171.0], [2201.0, 9191.0], [2281.0, 7428.666666666667], [2289.0, 6856.0], [2297.0, 8147.0], [2241.0, 6883.0], [2249.0, 9080.0], [2257.0, 8309.0], [2265.0, 8249.0], [2361.0, 7897.0], [2305.0, 6716.666666666667], [2337.0, 7843.0], [2345.0, 7456.0], [2353.0, 8363.0], [2313.0, 8484.0], [2321.0, 7358.5], [2329.0, 8009.0], [2401.0, 7324.0], [2417.0, 6309.5], [2425.0, 6420.0], [2409.0, 6496.0], [2369.0, 7799.0], [2393.0, 7217.0], [2377.0, 7114.0], [2433.0, 6529.0], [2457.0, 6632.0], [2449.0, 6929.0], [2441.0, 6581.0], [1081.0, 17088.0], [1057.0, 17816.0], [1061.0, 17747.0], [1065.0, 18322.0], [1085.0, 17966.0], [1077.0, 17312.0], [1073.0, 17324.0], [1025.0, 18476.0], [1029.0, 17721.0], [1033.0, 17398.0], [1037.0, 18568.0], [1053.0, 18164.0], [1049.0, 18445.0], [1045.0, 17855.0], [1041.0, 17931.0], [1069.0, 17459.0], [1145.0, 17804.0], [1121.0, 17351.0], [1129.0, 17280.0], [1149.0, 17753.0], [1141.0, 17785.0], [1137.0, 16958.0], [1093.0, 17453.0], [1097.0, 17004.0], [1101.0, 17256.0], [1117.0, 16802.0], [1113.0, 17016.0], [1109.0, 17495.0], [1105.0, 17982.0], [1133.0, 17815.0], [1157.0, 16369.0], [1201.0, 10062.0], [1153.0, 16977.0], [1161.0, 16071.0], [1165.0, 16112.0], [1177.0, 16477.0], [1169.0, 16838.0], [1181.0, 7578.666666666667], [1209.0, 9850.0], [1213.0, 9947.5], [1185.0, 15902.0], [1189.0, 16298.0], [1197.0, 15777.0], [1205.0, 16058.0], [1221.0, 16199.0], [1229.0, 9979.0], [1217.0, 7725.666666666667], [1245.0, 15740.0], [1241.0, 16008.0], [1237.0, 16028.0], [1233.0, 15462.0], [1265.0, 16023.0], [1269.0, 16040.0], [1225.0, 16097.5], [1249.0, 15874.0], [1253.0, 15555.0], [1257.0, 15684.0], [1261.0, 15931.0], [1277.0, 15409.0], [1273.0, 15668.0], [1285.0, 9754.5], [1337.0, 15255.0], [1301.0, 9799.0], [1297.0, 15409.0], [1305.0, 15171.0], [1281.0, 15115.0], [1309.0, 15032.0], [1313.0, 15099.0], [1317.0, 15082.0], [1321.0, 15290.0], [1325.0, 15518.0], [1341.0, 14949.0], [1333.0, 15026.0], [1329.0, 14881.0], [1293.0, 14992.0], [1289.0, 15649.0], [1377.0, 14937.0], [1389.0, 5632.857142857143], [1385.0, 14355.0], [1381.0, 15893.0], [1405.0, 14109.0], [1401.0, 14661.0], [1397.0, 14593.0], [1393.0, 14164.0], [1357.0, 15130.0], [1353.0, 14804.0], [1349.0, 15219.0], [1345.0, 14755.0], [1373.0, 14567.0], [1369.0, 14979.0], [1365.0, 14989.0], [1361.0, 15085.0], [1413.0, 14268.0], [1465.0, 13769.0], [1433.0, 5573.714285714285], [1429.0, 14078.0], [1425.0, 14409.0], [1409.0, 14551.0], [1417.0, 14486.0], [1421.0, 14372.0], [1437.0, 14280.0], [1441.0, 14223.0], [1445.0, 13857.0], [1449.0, 15152.0], [1453.0, 14075.0], [1469.0, 13981.0], [1461.0, 14022.0], [1457.0, 13981.0], [1481.0, 14828.0], [1529.0, 7225.333333333334], [1521.0, 8920.5], [1485.0, 8698.0], [1477.0, 13858.0], [1473.0, 13902.0], [1501.0, 13561.0], [1497.0, 14666.0], [1493.0, 13370.0], [1489.0, 13653.5], [1525.0, 9102.5], [1505.0, 14585.0], [1509.0, 13552.0], [1513.0, 13553.0], [1517.0, 14489.0], [1533.0, 13341.0], [1537.0, 13208.0], [1585.0, 3542.0], [1545.0, 13190.0], [1541.0, 13228.0], [1565.0, 12948.0], [1561.0, 13022.0], [1557.0, 13077.0], [1553.0, 13156.0], [1549.0, 8468.0], [1569.0, 8817.0], [1573.0, 9263.5], [1577.0, 12914.0], [1581.0, 12894.0], [1589.0, 15275.0], [1593.0, 12760.0], [1597.0, 8349.0], [1609.0, 12733.0], [1657.0, 12181.0], [1649.0, 8109.0], [1613.0, 13627.0], [1605.0, 12722.0], [1629.0, 8125.0], [1625.0, 13524.0], [1621.0, 13568.0], [1617.0, 13661.0], [1601.0, 13797.0], [1661.0, 6451.5], [1633.0, 12466.0], [1637.0, 13521.0], [1641.0, 13375.0], [1645.0, 13357.0], [1653.0, 12220.0], [1677.0, 12013.0], [1669.0, 6770.666666666666], [1665.0, 13143.0], [1713.0, 12954.0], [1673.0, 13357.0], [1717.0, 12929.0], [1721.0, 12732.0], [1725.0, 12623.0], [1685.0, 11960.0], [1681.0, 13106.0], [1689.0, 14529.0], [1693.0, 11870.0], [1705.0, 6787.0], [1701.0, 11872.0], [1709.0, 8060.5], [1697.0, 8076.0], [1729.0, 12570.0], [1737.0, 8334.5], [1789.0, 7333.333333333334], [1733.0, 11655.0], [1741.0, 14025.0], [1777.0, 11938.0], [1749.0, 10743.666666666666], [1745.0, 13952.0], [1753.0, 11549.0], [1757.0, 12645.0], [1765.0, 5957.0], [1769.0, 12541.0], [1773.0, 10752.0], [1781.0, 6505.5], [1785.0, 13246.0], [1841.0, 12522.0], [1845.0, 11150.0], [1853.0, 8564.0], [1849.0, 7006.0], [1805.0, 11624.0], [1825.0, 12918.0], [1793.0, 13417.0], [1797.0, 11593.0], [1801.0, 10458.0], [1821.0, 11340.0], [1817.0, 11130.0], [1813.0, 12536.0], [1809.0, 10344.0], [1833.0, 7106.0], [1837.0, 12118.0], [1829.0, 7811.0], [1885.0, 10217.0], [1869.0, 10292.0], [1905.0, 6761.333333333333], [1909.0, 11258.0], [1917.0, 11489.0], [1873.0, 10690.0], [1877.0, 12293.0], [1881.0, 10163.0], [1861.0, 11045.0], [1857.0, 12147.0], [1865.0, 10627.0], [1889.0, 8608.666666666666], [1897.0, 11790.0], [1901.0, 11535.0], [1893.0, 10724.0], [1929.0, 6348.333333333333], [1921.0, 9913.0], [1949.0, 9498.0], [1925.0, 10296.0], [1933.0, 10172.0], [1973.0, 7448.5], [1953.0, 10722.0], [1981.0, 10772.0], [1977.0, 9869.0], [1969.0, 7158.5], [1961.0, 7919.5], [1965.0, 6539.666666666667], [1937.0, 11124.0], [1941.0, 9624.0], [1945.0, 6451.0], [1997.0, 10828.0], [1993.0, 9017.333333333334], [2005.0, 8216.5], [1989.0, 10900.0], [2013.0, 6799.0], [2009.0, 8963.0], [2033.0, 8001.5], [2037.0, 10083.0], [2041.0, 7098.5], [2021.0, 10789.0], [2025.0, 9254.0], [2045.0, 9124.0], [2029.0, 7095.0], [2001.0, 7848.0], [2050.0, 9789.0], [2058.0, 6513.333333333333], [2098.0, 9671.0], [2106.0, 9687.0], [2090.0, 7233.0], [2082.0, 7641.5], [2066.0, 8542.0], [2074.0, 10057.0], [2146.0, 10060.0], [2170.0, 7829.0], [2162.0, 7290.75], [2154.0, 7655.5], [2122.0, 9388.0], [2114.0, 9757.0], [2130.0, 9926.0], [2138.0, 9341.5], [2178.0, 7572.5], [2226.0, 9274.0], [2218.0, 9236.0], [2234.0, 7147.0], [2210.0, 6575.5], [2186.0, 7675.0], [2194.0, 9410.0], [2202.0, 7472.5], [2274.0, 8676.0], [2282.0, 6583.0], [2290.0, 8383.0], [2298.0, 8359.0], [2242.0, 7370.0], [2266.0, 8580.0], [2258.0, 9137.0], [2250.0, 8421.0], [2306.0, 8578.0], [2330.0, 8087.0], [2322.0, 7900.0], [2402.0, 7118.0], [2338.0, 8334.0], [2362.0, 7042.0], [2354.0, 8195.0], [2346.0, 8197.0], [2410.0, 6986.0], [2418.0, 6892.0], [2426.0, 6629.0], [2370.0, 7212.5], [2394.0, 5322.0], [2386.0, 6244.0], [2378.0, 6976.0], [2442.0, 6427.0], [2434.0, 6371.5], [2450.0, 6525.0], [2458.0, 6261.0], [2051.0, 7999.5], [2107.0, 9509.0], [2099.0, 10271.0], [2091.0, 10163.0], [2083.0, 10445.0], [2059.0, 6016.142857142857], [2067.0, 8490.0], [2075.0, 7896.0], [2147.0, 9458.0], [2115.0, 7383.5], [2171.0, 8905.0], [2123.0, 7527.0], [2131.0, 9514.0], [2139.0, 9716.0], [2187.0, 8961.0], [2195.0, 7644.0], [2235.0, 7432.0], [2219.0, 6950.5], [2227.0, 9301.0], [2211.0, 8630.0], [2179.0, 9586.0], [2275.0, 7180.0], [2283.0, 8614.0], [2291.0, 8440.0], [2299.0, 8350.0], [2243.0, 9183.0], [2251.0, 8428.0], [2259.0, 8672.0], [2267.0, 8847.0], [2323.0, 7816.0], [2411.0, 6083.5], [2315.0, 7410.0], [2363.0, 6826.5], [2339.0, 7075.0], [2347.0, 8427.0], [2355.0, 8288.0], [2307.0, 8405.0], [2331.0, 8181.0], [2403.0, 7008.0], [2419.0, 6724.0], [2371.0, 7251.0], [2427.0, 7116.0], [2379.0, 6748.333333333333], [2395.0, 7050.0], [2387.0, 7182.0], [2435.0, 7050.0], [2451.0, 6324.5], [2443.0, 6505.0], [541.0, 21794.0], [523.0, 8174.333333333333], [521.0, 21613.0], [543.0, 21615.0], [539.0, 21648.0], [537.0, 22170.0], [535.0, 21336.0], [533.0, 21966.0], [529.0, 21948.0], [527.0, 21575.0], [515.0, 21451.0], [513.0, 22252.0], [519.0, 21646.0], [517.0, 22425.0], [525.0, 21969.0], [573.0, 20575.0], [575.0, 20632.0], [571.0, 20779.0], [569.0, 21162.0], [567.0, 21022.0], [565.0, 20579.0], [563.0, 21699.0], [561.0, 20871.0], [559.0, 20784.0], [547.0, 21711.0], [545.0, 22062.0], [551.0, 20839.0], [549.0, 21548.0], [557.0, 20779.0], [555.0, 20875.0], [553.0, 20602.0], [607.0, 20290.0], [591.0, 11075.0], [587.0, 11033.5], [585.0, 21145.0], [589.0, 21197.0], [599.0, 11044.0], [605.0, 20881.0], [603.0, 20069.0], [601.0, 20062.0], [583.0, 21139.0], [581.0, 20528.0], [579.0, 21230.0], [577.0, 21003.0], [597.0, 20457.0], [595.0, 20900.0], [593.0, 21347.0], [637.0, 20897.0], [611.0, 11183.0], [609.0, 20818.0], [615.0, 20109.0], [613.0, 19885.0], [623.0, 20094.0], [621.0, 20463.0], [619.0, 20906.0], [617.0, 19894.0], [639.0, 20167.0], [635.0, 20274.0], [633.0, 19674.0], [631.0, 19967.0], [629.0, 20541.0], [627.0, 20425.0], [625.0, 20365.0], [669.0, 20523.0], [647.0, 10775.0], [653.0, 13888.0], [651.0, 20067.0], [649.0, 20379.0], [655.0, 20376.0], [641.0, 19818.0], [645.0, 20330.0], [643.0, 19987.0], [671.0, 11003.0], [667.0, 19731.0], [665.0, 19720.0], [663.0, 20764.0], [661.0, 19743.0], [659.0, 20233.0], [657.0, 20134.0], [701.0, 19718.0], [683.0, 11140.5], [681.0, 19713.0], [687.0, 19310.0], [675.0, 19755.0], [673.0, 20146.0], [679.0, 20035.0], [677.0, 19589.0], [685.0, 20447.0], [703.0, 7846.333333333333], [699.0, 19910.0], [697.0, 20312.0], [695.0, 19586.0], [693.0, 20129.0], [691.0, 19408.0], [689.0, 20354.0], [733.0, 20111.0], [713.0, 11029.0], [715.0, 10752.5], [735.0, 19982.0], [731.0, 19090.0], [729.0, 19978.0], [719.0, 20056.0], [711.0, 20154.0], [709.0, 20127.0], [707.0, 20893.0], [705.0, 20095.0], [717.0, 19726.0], [727.0, 19497.0], [725.0, 19672.0], [723.0, 19746.0], [721.0, 19592.0], [767.0, 19496.0], [743.0, 10803.0], [741.0, 18929.0], [739.0, 19664.0], [737.0, 19542.0], [751.0, 19907.0], [749.0, 19513.0], [747.0, 19411.0], [745.0, 19170.0], [757.0, 10528.5], [761.0, 10957.5], [765.0, 19414.0], [763.0, 19138.0], [759.0, 19055.0], [755.0, 19159.0], [753.0, 18885.0], [797.0, 18822.0], [775.0, 7890.666666666667], [773.0, 19003.0], [771.0, 19467.0], [769.0, 19290.0], [799.0, 19704.0], [795.0, 19411.0], [793.0, 19130.0], [791.0, 18711.0], [789.0, 18392.0], [787.0, 19960.0], [783.0, 18806.0], [781.0, 19059.0], [779.0, 19734.0], [777.0, 19076.0], [829.0, 18060.0], [831.0, 19210.0], [827.0, 18459.0], [825.0, 18998.0], [823.0, 19209.0], [821.0, 19053.0], [819.0, 19367.0], [817.0, 19394.0], [815.0, 18441.0], [803.0, 19552.0], [801.0, 19674.0], [807.0, 19380.0], [805.0, 19414.0], [813.0, 18944.0], [811.0, 19728.0], [809.0, 18893.0], [861.0, 18877.0], [843.0, 10305.5], [841.0, 18386.0], [847.0, 19118.0], [835.0, 18938.0], [833.0, 19300.0], [839.0, 19364.0], [837.0, 19363.0], [845.0, 19523.0], [863.0, 18975.0], [859.0, 18030.0], [857.0, 18904.0], [855.0, 18645.0], [853.0, 18296.0], [851.0, 18572.0], [849.0, 18242.0], [893.0, 18580.0], [895.0, 19972.0], [891.0, 18660.0], [889.0, 18421.0], [887.0, 18680.0], [885.0, 18038.0], [883.0, 18894.0], [881.0, 18863.0], [879.0, 18838.0], [867.0, 19042.0], [865.0, 18895.0], [871.0, 17753.0], [869.0, 17585.0], [877.0, 18877.0], [875.0, 18771.0], [873.0, 18825.0], [927.0, 18547.0], [913.0, 10290.0], [925.0, 18217.0], [923.0, 18698.0], [921.0, 18692.0], [903.0, 18652.0], [901.0, 18648.0], [899.0, 18461.0], [897.0, 18622.0], [919.0, 18786.0], [917.0, 18369.0], [915.0, 18920.0], [911.0, 19042.0], [909.0, 18826.0], [907.0, 19295.0], [905.0, 18576.0], [957.0, 10545.0], [959.0, 10361.5], [955.0, 18470.0], [953.0, 18386.0], [951.0, 18070.0], [949.0, 18772.0], [947.0, 18316.0], [945.0, 18085.0], [943.0, 18744.0], [931.0, 17957.0], [929.0, 18429.0], [935.0, 18533.0], [933.0, 18427.0], [941.0, 18167.0], [939.0, 18902.0], [937.0, 18404.0], [991.0, 17696.0], [967.0, 7722.0], [963.0, 10176.0], [965.0, 7867.666666666667], [977.0, 18002.0], [979.0, 17761.0], [981.0, 17981.0], [983.0, 18591.0], [989.0, 17887.0], [987.0, 18150.0], [985.0, 18138.0], [971.0, 18345.0], [973.0, 18278.0], [975.0, 18090.0], [969.0, 10572.0], [961.0, 10456.5], [1021.0, 18626.0], [1023.0, 18651.0], [1009.0, 17821.0], [1011.0, 18243.0], [1013.0, 17859.0], [1019.0, 17872.0], [1017.0, 17743.0], [1007.0, 18068.0], [993.0, 17923.0], [995.0, 17228.0], [997.0, 18988.0], [999.0, 18933.0], [1005.0, 17996.0], [1003.0, 17957.0], [1001.0, 18809.0], [1015.0, 17759.0], [1082.0, 18154.0], [1086.0, 17373.0], [1058.0, 18371.0], [1062.0, 18274.0], [1066.0, 17876.0], [1078.0, 17801.0], [1074.0, 17874.0], [1054.0, 17295.0], [1026.0, 17691.0], [1030.0, 18585.0], [1034.0, 19552.0], [1038.0, 17311.0], [1050.0, 17529.0], [1046.0, 17351.0], [1042.0, 17417.0], [1070.0, 17384.0], [1146.0, 17036.0], [1150.0, 17062.0], [1122.0, 16806.0], [1126.0, 17633.5], [1130.0, 16752.0], [1142.0, 17741.0], [1138.0, 17752.0], [1118.0, 17728.0], [1090.0, 17352.0], [1094.0, 17021.0], [1098.0, 17007.0], [1102.0, 17365.0], [1114.0, 16850.0], [1110.0, 17616.0], [1106.0, 17489.0], [1134.0, 17598.0], [1182.0, 16103.0], [1178.0, 16771.0], [1174.0, 16326.0], [1170.0, 16309.0], [1154.0, 16098.0], [1158.0, 16633.0], [1162.0, 16904.0], [1166.0, 16883.0], [1186.0, 15963.0], [1190.0, 15955.0], [1194.0, 16359.0], [1198.0, 16611.0], [1202.0, 9665.5], [1206.0, 15941.0], [1214.0, 16109.0], [1210.0, 15926.0], [1218.0, 9666.0], [1222.0, 15961.0], [1234.0, 15479.0], [1238.0, 16021.0], [1242.0, 15581.0], [1246.0, 15865.0], [1230.0, 9943.5], [1270.0, 17013.0], [1226.0, 7971.333333333334], [1278.0, 15427.0], [1250.0, 15708.0], [1254.0, 15550.0], [1258.0, 15400.0], [1262.0, 15521.0], [1274.0, 15370.0], [1310.0, 14941.0], [1286.0, 9883.0], [1298.0, 15716.0], [1302.0, 15302.0], [1306.0, 15650.0], [1282.0, 15294.0], [1342.0, 14938.0], [1314.0, 15095.0], [1318.0, 14728.0], [1322.0, 15346.0], [1326.0, 14525.0], [1338.0, 14906.0], [1330.0, 15083.0], [1294.0, 14921.0], [1290.0, 15412.0], [1350.0, 15143.0], [1354.0, 9745.5], [1346.0, 14882.0], [1358.0, 15153.0], [1374.0, 14347.0], [1370.0, 14636.0], [1366.0, 14846.0], [1362.0, 14842.0], [1406.0, 14469.0], [1378.0, 14926.0], [1382.0, 14889.0], [1386.0, 14704.0], [1390.0, 14765.0], [1402.0, 14701.0], [1398.0, 14679.0], [1394.0, 14432.0], [1466.0, 13991.0], [1470.0, 13911.0], [1442.0, 14192.0], [1446.0, 14132.0], [1450.0, 14103.0], [1462.0, 14972.0], [1458.0, 13998.0], [1438.0, 14026.0], [1410.0, 14340.0], [1414.0, 15511.0], [1418.0, 14119.0], [1422.0, 14429.0], [1434.0, 14264.0], [1430.0, 14303.0], [1426.0, 14223.0], [1454.0, 14110.0], [1534.0, 13328.0], [1526.0, 13471.0], [1506.0, 8627.0], [1518.0, 8833.0], [1514.0, 13550.0], [1510.0, 13536.0], [1530.0, 13422.0], [1522.0, 13475.0], [1486.0, 14822.0], [1482.0, 13791.0], [1478.0, 13834.0], [1474.0, 13888.0], [1502.0, 13157.0], [1498.0, 13661.0], [1494.0, 13666.0], [1490.0, 13694.0], [1566.0, 13000.0], [1594.0, 12803.0], [1550.0, 8317.0], [1554.0, 14099.0], [1558.0, 13033.0], [1562.0, 13997.0], [1538.0, 13272.0], [1542.0, 14327.0], [1546.0, 13154.0], [1570.0, 13939.0], [1574.0, 12881.0], [1578.0, 12804.0], [1582.0, 12867.0], [1598.0, 8612.5], [1590.0, 13800.0], [1586.0, 12741.5], [1614.0, 12645.0], [1602.0, 12724.0], [1630.0, 12489.0], [1626.0, 13681.0], [1622.0, 12598.0], [1618.0, 13661.0], [1650.0, 8510.5], [1610.0, 12666.0], [1606.0, 12561.0], [1654.0, 6340.25], [1662.0, 12152.0], [1634.0, 13457.0], [1638.0, 13497.0], [1642.0, 12336.0], [1646.0, 12221.0], [1658.0, 13284.0], [1714.0, 7115.333333333334], [1718.0, 8337.5], [1722.0, 11733.0], [1726.0, 11665.0], [1682.0, 8350.0], [1686.0, 13054.0], [1690.0, 12974.0], [1694.0, 7176.666666666666], [1666.0, 12122.0], [1670.0, 13208.0], [1674.0, 12962.0], [1678.0, 14647.0], [1706.0, 8541.5], [1710.0, 7703.666666666666], [1698.0, 6987.0], [1702.0, 13913.0], [1734.0, 12904.0], [1730.0, 7660.0], [1738.0, 12737.0], [1742.0, 12652.0], [1778.0, 10719.0], [1754.0, 7910.5], [1750.0, 12654.0], [1746.0, 11553.0], [1758.0, 12634.0], [1770.0, 11501.0], [1766.0, 12671.0], [1774.0, 11827.0], [1782.0, 12710.0], [1786.0, 11732.0], [1790.0, 11685.0], [1762.0, 13413.5], [1798.0, 7860.0], [1846.0, 10819.0], [1854.0, 7257.666666666666], [1802.0, 7127.666666666666], [1794.0, 11603.0], [1842.0, 11225.0], [1806.0, 12582.0], [1850.0, 11096.0], [1822.0, 6523.0], [1818.0, 11444.0], [1814.0, 11450.0], [1810.0, 12956.0], [1826.0, 8859.0], [1830.0, 7958.0], [1838.0, 12772.0], [1834.0, 6859.666666666666], [1862.0, 12049.5], [1870.0, 10976.0], [1906.0, 7536.5], [1910.0, 11704.0], [1914.0, 11162.0], [1918.0, 9903.0], [1874.0, 7828.0], [1878.0, 10414.0], [1882.0, 8319.5], [1866.0, 10844.0], [1886.0, 11971.0], [1898.0, 10544.0], [1902.0, 11657.0], [1894.0, 7425.0], [1890.0, 10530.0], [1930.0, 9798.0], [1934.0, 9736.0], [1922.0, 11209.0], [1950.0, 7357.0], [1946.0, 10092.0], [1926.0, 6204.25], [1970.0, 8093.0], [1974.0, 6617.5], [1982.0, 9352.0], [1978.0, 10781.0], [1958.0, 11116.5], [1962.0, 11040.0], [1966.0, 10622.0], [1938.0, 10185.0], [1942.0, 10115.0], [1990.0, 8159.0], [1994.0, 10371.0], [1986.0, 10702.0], [2014.0, 10524.0], [2006.0, 6362.0], [2010.0, 8107.0], [1998.0, 10754.0], [2034.0, 7001.5], [2038.0, 10473.0], [2018.0, 9115.0], [2022.0, 8707.0], [2046.0, 7062.666666666667], [2042.0, 10436.0], [2026.0, 7341.0], [2030.0, 8086.0], [2002.0, 7773.0], [2060.0, 6033.857142857142], [2052.0, 10543.0], [2100.0, 9572.0], [2108.0, 7537.5], [2092.0, 10238.0], [2084.0, 10127.0], [2068.0, 6945.5], [2076.0, 10439.0], [2164.0, 7534.0], [2156.0, 8884.0], [2148.0, 7822.0], [2124.0, 9297.0], [2116.0, 8569.0], [2172.0, 9766.0], [2132.0, 7529.0], [2140.0, 7691.5], [2180.0, 9689.0], [2228.0, 6706.5], [2220.0, 8602.0], [2236.0, 7601.5], [2212.0, 8835.0], [2188.0, 9452.0], [2196.0, 8069.0], [2204.0, 7720.5], [2276.0, 8480.0], [2284.0, 8556.0], [2292.0, 8360.0], [2300.0, 8251.0], [2244.0, 6254.0], [2268.0, 6140.0], [2252.0, 9171.0], [2308.0, 8143.0], [2324.0, 8044.0], [2420.0, 7243.0], [2332.0, 7199.5], [2404.0, 7091.0], [2340.0, 8540.0], [2316.0, 8372.0], [2364.0, 8231.0], [2356.0, 8135.0], [2348.0, 8384.0], [2412.0, 7360.0], [2428.0, 6610.0], [2372.0, 8056.0], [2396.0, 5214.0], [2388.0, 6204.0], [2380.0, 7455.0], [2444.0, 6150.5], [2436.0, 6433.0], [2452.0, 6379.0], [2061.0, 6718.75], [2109.0, 7614.5], [2101.0, 9908.0], [2093.0, 9537.0], [2085.0, 10366.0], [2053.0, 8447.0], [2069.0, 6434.666666666667], [2077.0, 8853.0], [2149.0, 7992.0], [2117.0, 9571.0], [2173.0, 6966.0], [2165.0, 9745.0], [2157.0, 9519.0], [2125.0, 7606.5], [2133.0, 7019.666666666667], [2141.0, 9817.0], [2181.0, 7371.0], [2237.0, 8684.0], [2221.0, 7831.0], [2229.0, 9021.0], [2213.0, 8965.0], [2189.0, 8059.0], [2205.0, 9474.0], [2197.0, 9352.0], [2277.0, 7370.0], [2285.0, 8785.0], [2293.0, 8709.0], [2301.0, 8415.0], [2245.0, 6752.5], [2253.0, 6986.0], [2261.0, 6856.0], [2269.0, 7223.25], [2317.0, 8630.0], [2309.0, 6907.0], [2365.0, 8211.0], [2341.0, 8162.0], [2349.0, 8552.0], [2357.0, 6236.0], [2325.0, 7052.5], [2333.0, 6203.0], [2405.0, 6967.0], [2413.0, 6790.0], [2421.0, 6796.0], [2429.0, 6589.0], [2381.0, 6913.0], [2397.0, 7629.0], [2389.0, 6837.0], [2373.0, 6829.0], [2437.0, 6550.0], [2445.0, 6374.0], [2453.0, 6262.5], [1083.0, 17657.0], [1087.0, 17872.0], [1059.0, 17531.0], [1063.0, 17867.0], [1067.0, 18299.0], [1079.0, 17459.0], [1075.0, 17677.0], [1055.0, 17636.0], [1027.0, 17790.0], [1031.0, 17655.0], [1035.0, 18585.0], [1039.0, 17599.0], [1051.0, 17259.0], [1047.0, 18142.0], [1043.0, 18469.0], [1071.0, 17283.0], [1147.0, 17125.0], [1151.0, 16976.0], [1127.0, 17811.0], [1123.0, 17356.0], [1131.0, 17104.0], [1143.0, 17439.0], [1139.0, 17401.0], [1119.0, 17850.0], [1091.0, 17321.0], [1095.0, 18043.0], [1099.0, 17662.0], [1103.0, 17275.0], [1115.0, 17466.0], [1111.0, 16830.0], [1107.0, 17974.0], [1135.0, 16919.0], [1159.0, 15908.0], [1183.0, 7888.0], [1163.0, 16675.0], [1167.0, 16512.0], [1179.0, 7772.666666666667], [1175.0, 16032.0], [1171.0, 16304.0], [1215.0, 15709.0], [1187.0, 16363.0], [1191.0, 16650.0], [1199.0, 16160.0], [1211.0, 15797.0], [1203.0, 15901.0], [1223.0, 10020.0], [1271.0, 15250.0], [1219.0, 16079.0], [1247.0, 15498.0], [1243.0, 15959.0], [1239.0, 16035.0], [1235.0, 15924.0], [1231.0, 7811.0], [1267.0, 16355.5], [1227.0, 9839.0], [1279.0, 15638.0], [1251.0, 16173.0], [1255.0, 16143.0], [1259.0, 15527.0], [1263.0, 15392.0], [1311.0, 14744.0], [1299.0, 15477.0], [1303.0, 15200.0], [1307.0, 15266.0], [1283.0, 15443.0], [1343.0, 14547.0], [1315.0, 15538.0], [1319.0, 15360.0], [1323.0, 15478.0], [1327.0, 15507.0], [1339.0, 14471.0], [1335.0, 14883.5], [1331.0, 15139.0], [1295.0, 15720.0], [1291.0, 15755.0], [1287.0, 15145.0], [1407.0, 14620.0], [1403.0, 14634.0], [1387.0, 14817.0], [1383.0, 14741.0], [1379.0, 14650.0], [1391.0, 14532.0], [1399.0, 14666.0], [1395.0, 14398.0], [1359.0, 14698.0], [1355.0, 14986.0], [1351.0, 15169.0], [1347.0, 15241.0], [1375.0, 14569.0], [1371.0, 14945.0], [1367.0, 15014.0], [1363.0, 15053.0], [1439.0, 14050.0], [1431.0, 14291.0], [1427.0, 14279.0], [1435.0, 14263.0], [1411.0, 14275.0], [1415.0, 14538.0], [1419.0, 14246.0], [1423.0, 14427.0], [1471.0, 13918.0], [1443.0, 14174.0], [1447.0, 14120.0], [1451.0, 13818.0], [1455.0, 14053.0], [1467.0, 13884.0], [1463.0, 14044.0], [1459.0, 14051.0], [1479.0, 14804.0], [1483.0, 14841.0], [1475.0, 13907.0], [1487.0, 13743.0], [1503.0, 13594.0], [1499.0, 13694.0], [1495.0, 14693.0], [1491.0, 13711.0], [1535.0, 13312.0], [1507.0, 13586.0], [1511.0, 13321.0], [1515.0, 13410.0], [1519.0, 13525.0], [1531.0, 13340.0], [1527.0, 13453.0], [1523.0, 13431.0], [1543.0, 13201.0], [1547.0, 8754.5], [1539.0, 14359.0], [1567.0, 12981.0], [1563.0, 13055.0], [1559.0, 14034.0], [1555.0, 13089.0], [1551.0, 7331.666666666666], [1571.0, 12953.0], [1575.0, 13917.0], [1579.0, 12874.0], [1583.0, 12884.0], [1587.0, 6853.666666666666], [1591.0, 12795.0], [1595.0, 12844.0], [1599.0, 12768.0], [1603.0, 8635.0], [1615.0, 12654.0], [1611.0, 12673.0], [1607.0, 12721.0], [1651.0, 12221.0], [1627.0, 12535.0], [1623.0, 12396.0], [1619.0, 13602.0], [1631.0, 14718.0], [1647.0, 9038.0], [1663.0, 14143.0], [1635.0, 12459.0], [1639.0, 12341.0], [1643.0, 12350.0], [1659.0, 13264.0], [1655.0, 13199.0], [1679.0, 13254.0], [1719.0, 11732.0], [1727.0, 12705.0], [1667.0, 8498.0], [1715.0, 8017.5], [1675.0, 14282.0], [1671.0, 14347.0], [1723.0, 12824.0], [1687.0, 8105.0], [1683.0, 11987.0], [1691.0, 11929.0], [1695.0, 8551.5], [1699.0, 8085.0], [1703.0, 11874.0], [1707.0, 12864.0], [1711.0, 11802.0], [1735.0, 7227.333333333334], [1731.0, 11644.0], [1743.0, 8364.0], [1739.0, 12856.0], [1779.0, 13096.0], [1747.0, 12805.0], [1751.0, 12718.0], [1755.0, 14148.0], [1759.0, 12769.0], [1767.0, 12751.0], [1771.0, 12696.0], [1775.0, 13331.0], [1763.0, 9369.5], [1791.0, 8187.5], [1787.0, 10641.0], [1783.0, 10666.0], [1807.0, 11457.0], [1803.0, 4611.0], [1851.0, 12109.0], [1847.0, 11133.0], [1843.0, 10913.0], [1855.0, 8326.5], [1827.0, 12291.0], [1823.0, 7778.0], [1795.0, 13444.0], [1799.0, 11575.0], [1819.0, 11438.0], [1815.0, 10283.0], [1811.0, 11125.0], [1835.0, 7899.5], [1839.0, 11063.0], [1831.0, 12500.0], [1871.0, 7325.0], [1887.0, 6445.75], [1907.0, 5669.428571428572], [1911.0, 10479.0], [1915.0, 8294.5], [1919.0, 7635.5], [1875.0, 12009.0], [1879.0, 7857.0], [1883.0, 10346.0], [1859.0, 11685.5], [1863.0, 10883.0], [1867.0, 10864.0], [1895.0, 8292.0], [1899.0, 8568.5], [1903.0, 10607.0], [1891.0, 10067.0], [1931.0, 6167.0], [1923.0, 7208.0], [1947.0, 11573.0], [1951.0, 6435.0], [1927.0, 7269.5], [1935.0, 11518.0], [1971.0, 11414.0], [1975.0, 7003.333333333333], [1983.0, 9794.0], [1979.0, 9243.0], [1959.0, 7175.666666666666], [1963.0, 10679.0], [1967.0, 9336.0], [1955.0, 7866.25], [1939.0, 10905.0], [1943.0, 7297.0], [1995.0, 9000.0], [1991.0, 6001.000000000001], [1987.0, 10856.0], [2015.0, 11004.0], [2007.0, 9053.0], [2011.0, 6638.0], [1999.0, 10678.0], [2039.0, 7738.0], [2035.0, 10894.0], [2047.0, 6355.5], [2019.0, 10156.0], [2023.0, 10566.0], [2043.0, 8597.0], [2031.0, 10423.0], [2027.0, 8875.0], [2003.0, 11031.0], [2062.0, 8388.0], [2054.0, 7717.5], [2110.0, 8005.5], [2102.0, 7825.0], [2094.0, 8007.0], [2086.0, 6304.6], [2070.0, 6947.333333333333], [2078.0, 8808.0], [2166.0, 7305.5], [2158.0, 7484.0], [2150.0, 7940.5], [2126.0, 7563.0], [2118.0, 9960.0], [2174.0, 9088.0], [2134.0, 7284.5], [2142.0, 9763.0], [2190.0, 9750.0], [2182.0, 9050.0], [2222.0, 9252.0], [2238.0, 6389.5], [2230.0, 6690.5], [2214.0, 6265.0], [2198.0, 7012.0], [2206.0, 9246.0], [2278.0, 7290.0], [2286.0, 9069.0], [2294.0, 8544.0], [2302.0, 7029.0], [2246.0, 6860.0], [2254.0, 9119.0], [2270.0, 8159.0], [2310.0, 8097.0], [2326.0, 8100.0], [2334.0, 6873.0], [2406.0, 6270.0], [2342.0, 7543.5], [2318.0, 8387.0], [2366.0, 7402.0], [2358.0, 6540.0], [2350.0, 8326.0], [2414.0, 6777.0], [2422.0, 7231.0], [2430.0, 6567.0], [2374.0, 6979.5], [2398.0, 6996.0], [2390.0, 7255.0], [2382.0, 7333.0], [2446.0, 6130.5], [2438.0, 6462.5], [2454.0, 6583.0], [2063.0, 7719.5], [2055.0, 7461.0], [2111.0, 7063.0], [2103.0, 9771.0], [2095.0, 8738.0], [2087.0, 6482.5], [2071.0, 10205.0], [2079.0, 9732.0], [2151.0, 9551.0], [2119.0, 7993.0], [2175.0, 8936.0], [2167.0, 9705.0], [2159.0, 9404.0], [2127.0, 8116.0], [2135.0, 7927.0], [2143.0, 9187.0], [2183.0, 6536.75], [2191.0, 8202.0], [2239.0, 6638.5], [2231.0, 6504.25], [2223.0, 9379.0], [2215.0, 6850.333333333333], [2207.0, 9038.0], [2199.0, 8803.0], [2279.0, 8628.0], [2287.0, 7296.0], [2295.0, 8582.0], [2303.0, 8181.0], [2247.0, 9113.0], [2255.0, 8508.0], [2263.0, 7627.75], [2271.0, 8514.0], [2367.0, 7510.0], [2343.0, 8459.0], [2351.0, 6150.0], [2359.0, 8264.0], [2311.0, 7118.0], [2319.0, 8465.0], [2327.0, 8687.0], [2335.0, 8236.0], [2415.0, 6577.0], [2423.0, 7012.0], [2407.0, 6598.5], [2431.0, 6685.0], [2383.0, 6692.0], [2399.0, 6718.0], [2391.0, 7348.0], [2375.0, 7237.0], [2439.0, 6687.0], [2455.0, 6812.0], [2447.0, 6575.0], [1.0, 24185.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1312.7253333333315, 13998.039666666657]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2458.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 7282.383333333333, "minX": 1.54958358E12, "maxY": 12885.05, "series": [{"data": [[1.54958358E12, 12885.05], [1.54958364E12, 8112.033333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958358E12, 11567.616666666667], [1.54958364E12, 7282.383333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 9528.317762085824, "minX": 1.54958358E12, "maxY": 21097.917169974135, "series": [{"data": [[1.54958358E12, 9528.317762085824], [1.54958364E12, 21097.917169974135]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 9528.277566539915, "minX": 1.54958358E12, "maxY": 21097.913718723026, "series": [{"data": [[1.54958358E12, 9528.277566539915], [1.54958364E12, 21097.913718723026]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 2.2182916307161284, "minX": 1.54958358E12, "maxY": 95.22922324823459, "series": [{"data": [[1.54958358E12, 95.22922324823459], [1.54958364E12, 2.2182916307161284]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 871.0, "minX": 1.54958358E12, "maxY": 26246.0, "series": [{"data": [[1.54958358E12, 17019.0], [1.54958364E12, 26246.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958358E12, 871.0], [1.54958364E12, 15908.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958358E12, 15014.8], [1.54958364E12, 23380.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958358E12, 16466.5], [1.54958364E12, 25109.909999999996]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958358E12, 15717.8], [1.54958364E12, 23987.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 9600.0, "minX": 19.0, "maxY": 20855.0, "series": [{"data": [[19.0, 20855.0], [30.0, 9600.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 9600.0, "minX": 19.0, "maxY": 20855.0, "series": [{"data": [[19.0, 20855.0], [30.0, 9600.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958358E12, "maxY": 50.0, "series": [{"data": [[1.54958358E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 19.316666666666666, "minX": 1.54958358E12, "maxY": 30.683333333333334, "series": [{"data": [[1.54958358E12, 30.683333333333334], [1.54958364E12, 19.316666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 19.316666666666666, "minX": 1.54958358E12, "maxY": 30.683333333333334, "series": [{"data": [[1.54958358E12, 30.683333333333334], [1.54958364E12, 19.316666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Transactions Per Second"}},
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
